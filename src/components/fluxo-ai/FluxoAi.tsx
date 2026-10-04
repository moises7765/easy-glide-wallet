import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DefaultChatTransport, type ChatStatus, type UIMessage } from "ai";
import { Mic, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import fluxoAiMark from "@/assets/fluxo-ai-mark.png";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputButton, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { executeFluxoAiAction } from "@/lib/fluxo-ai.functions";
import { completeLaunch, isFinancialQuestion, launchDoneMessage, localFinancialAnswer, parseLaunchCommand, type LaunchCommand, parseActionProposal, proposalSummary, type FluxoAiContext } from "@/lib/fluxo-ai";
import { useRows } from "@/lib/queries";

type SpeechRecognitionEventLike = Event & { results: { [index: number]: { [index: number]: { transcript: string } } }; resultIndex: number };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const SUGGESTIONS = ["💰 Minha situação", "🎯 Minhas metas", "💳 Cartões", "📊 Meus gastos", "💡 O que devo fazer?"];

function textOf(message: UIMessage) {
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
}

function friendlyError(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("402")) return "Os créditos do Fluxo IA acabaram. O responsável pelo app precisa adicionar créditos.";
  if (message.includes("429")) return "O Fluxo IA está recebendo muitas solicitações. Tente novamente em instantes.";
  if (message.includes("401")) return "Sua sessão expirou. Entre novamente para continuar.";
  return error.message || "Não foi possível falar com o Fluxo IA agora.";
}

export function FluxoAiButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="icon" onClick={onClick} aria-label="Abrir Fluxo IA" className="fluxo-ai-fab fixed right-5 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 h-12 w-12 rounded-full border border-primary/35 bg-card p-1.5 shadow-xl">
      <img src={fluxoAiMark} alt="" width={512} height={512} className="h-full w-full object-contain" />
    </Button>
  );
}

function ChatMessage({ message, onSpeak, speaking }: { message: UIMessage; onSpeak: (text: string) => void; speaking: boolean }) {
  const text = textOf(message);
  return (
    <Message from={message.role}>
      <MessageContent className={message.role === "user" ? "bg-primary text-primary-foreground" : undefined}>
        <MessageResponse>{text}</MessageResponse>
      </MessageContent>
      {message.role === "assistant" && text ? (
        <MessageActions>
          <MessageAction tooltip={speaking ? "Parar leitura" : "Ouvir resposta"} onClick={() => onSpeak(text)}>
            {speaking ? <VolumeX /> : <Volume2 />}
          </MessageAction>
        </MessageActions>
      ) : null}
    </Message>
  );
}

export function FluxoAiDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: transactions = [] } = useRows("transactions");
  const { data: categories = [] } = useRows("categories");
  const { data: cards = [] } = useRows("cards");
  const { data: purchases = [] } = useRows("installment_purchases");
  const { data: goals = [] } = useRows("goals");
  const { data: assets = [] } = useRows("assets");
  const context: FluxoAiContext = useMemo(() => ({ transactions, categories, cards, purchases, goals, assets }), [transactions, categories, cards, purchases, goals, assets]);
  const [draft, setDraft] = useState("");
  const [pendingLaunch, setPendingLaunch] = useState<LaunchCommand | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const queryClient = useQueryClient();
  const executeAction = useServerFn(executeFluxoAiAction);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/fluxo-ai",
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    },
  }), []);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
    onError: (chatError) => toast.error(friendlyError(chatError)),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 180);
  }, [open, status]);
  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const addLocalMessage = useCallback((role: "user" | "assistant", text: string) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role, parts: [{ type: "text", text }] }]);
  }, [setMessages]);

  const submitText = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setDraft("");
    const handleLaunch = async (command: LaunchCommand) => {
      if (command.status === "needs_type") {
        setPendingLaunch(command);
        addLocalMessage("assistant", "É uma entrada ou uma saída?");
        return;
      }
      if (command.status === "needs_card") {
        setPendingLaunch(command);
        addLocalMessage("assistant", `Em qual cartão?${cards.length ? ` (${cards.map((card) => card.name).join(", ")})` : ""}`);
        return;
      }
      setPendingLaunch(null);
      try {
        await executeAction({ data: command.proposal });
        await queryClient.invalidateQueries();
        addLocalMessage("assistant", launchDoneMessage(command.proposal));
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Não foi possível salvar o lançamento.";
        addLocalMessage("assistant", `Não consegui salvar: ${message}`);
      }
    };
    if (pendingLaunch) {
      if (/^(cancelar|cancela|deixa|esquece)\b/i.test(text)) {
        addLocalMessage("user", text);
        setPendingLaunch(null);
        addLocalMessage("assistant", "Tudo bem, nada foi registrado.");
        return;
      }
      const completed = completeLaunch(pendingLaunch, text, context);
      if (completed) {
        addLocalMessage("user", text);
        await handleLaunch(completed);
        return;
      }
    }
    const launch = parseLaunchCommand(text, context);
    if (launch) {
      addLocalMessage("user", text);
      await handleLaunch(launch);
      return;
    }
    const action = isFinancialQuestion(text) ? null : parseActionProposal(text, context);
    if (action) {
      addLocalMessage("user", text);
      if (action.kind === "transaction") {
        await handleLaunch(action.installments > 1 && !action.cardId ? { status: "needs_card", proposal: action } : { status: "ready", proposal: action });
        return;
      }
      try {
        await executeAction({ data: action });
        await queryClient.invalidateQueries();
        addLocalMessage("assistant", `✅ Meta criada: ${proposalSummary(action)}.`);
      } catch (actionError) {
        addLocalMessage("assistant", `Não consegui criar a meta: ${actionError instanceof Error ? actionError.message : "erro desconhecido"}`);
      }
      return;
    }
    try {
      await sendMessage({ text });
    } catch {
      addLocalMessage("user", text);
      addLocalMessage("assistant", localFinancialAnswer(text, context));
    }
  }, [addLocalMessage, busy, cards, context, executeAction, pendingLaunch, queryClient, sendMessage]);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info("O reconhecimento de voz não está disponível neste navegador.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[event.resultIndex]?.[0]?.transcript ?? "";
      setDraft(transcript);
      if (transcript) void submitText(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      toast.error("Não consegui ouvir. Verifique a permissão do microfone.");
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      toast.info("A leitura em voz alta não está disponível neste navegador.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, ""));
    utterance.lang = "pt-BR";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto h-[92dvh] max-w-2xl border-border bg-popover">
        <DrawerHeader className="flex-row items-center gap-3 border-b border-border px-4 py-3 text-left">
          <img src={fluxoAiMark} alt="" width={512} height={512} className="h-10 w-10 object-contain" />
          <div className="min-w-0 flex-1"><DrawerTitle>Fluxo IA</DrawerTitle><DrawerDescription>Seu copiloto financeiro</DrawerDescription></div>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <Conversation className="min-h-0">
            <ConversationContent className="gap-4 px-4 py-5">
              {messages.length === 0 ? (
                <div className="py-4">
                  <h2 className="text-lg font-semibold">Olá. Como posso ajudar?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Pergunte sobre seus números ou registre algo por conversa.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((suggestion) => <Button key={suggestion} type="button" variant="secondary" size="sm" className="rounded-full" onClick={() => void submitText(suggestion)}>{suggestion}</Button>)}
                  </div>
                </div>
              ) : messages.map((message) => <ChatMessage key={message.id} message={message} onSpeak={speak} speaking={speaking} />)}
              {status === "submitted" ? <Shimmer className="text-sm">Analisando seus dados...</Shimmer> : null}
              {error ? <p className="text-sm text-destructive">{friendlyError(error)}</p> : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="border-t border-border bg-popover px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {listening ? <p className="mb-2 text-center text-xs font-medium text-primary">Ouvindo… toque no microfone para parar</p> : null}
            <PromptInput onSubmit={(message) => void submitText(message.text)} className="bg-background">
              <PromptInputTextarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Pergunte ou registre uma movimentação…" className="min-h-12" />
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputButton tooltip={listening ? "Parar de ouvir" : "Falar"} aria-label={listening ? "Parar de ouvir" : "Falar"} onClick={toggleListening} className={listening ? "bg-destructive text-destructive-foreground" : undefined}>{listening ? <Square /> : <Mic />}</PromptInputButton>
                </PromptInputTools>
                <PromptInputSubmit status={status as ChatStatus} disabled={!draft.trim() && !busy} onStop={stop} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}