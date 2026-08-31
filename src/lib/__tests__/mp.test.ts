import { describe, it, expect } from "vitest";
import { rowsFromMercadoPagoText, rowsFromPdfLines } from "../statement-import";

const lines = [
"Data Descrição ID da operação Valor Saldo",
"02-08-2026 Pix recebido LUAN DE ANDRADE RAMON DE JESUS 170825528987 R$ 715,00 R$ 715,00",
"02-08-2026 Dinheiro reservado Pagar cartão 171720386334 R$ -66,40 R$ 0,00",
"26-08-2026 Pagamento com QR Pix GOLFINHO ARTIGOS PARA BORRACHARIA E",
"MOTOPECAS LTDA 174815589823 R$ -33,50 R$ 6,50",
"27-08-2026 Pix enviado JOAO 174815589824 -R$ 12,30 R$ 1.006,50",
];

describe("mp", () => {
  it("parses", () => {
    const rows = rowsFromPdfLines(lines);
    console.log(JSON.stringify(rows, null, 1));
    expect(rows.length).toBe(4);
    expect(rows[0]!.amount).toBe(715); expect(rows[0]!.flow).toBe("income");
    expect(rows[0]!.description).toContain("LUAN DE ANDRADE RAMON DE JESUS");
    expect(rows[1]!.flow).toBe("transfer");
    expect(rows[2]!.amount).toBe(33.5); expect(rows[2]!.flow).toBe("expense");
    expect(rows[2]!.description).toContain("MOTOPECAS");
    expect(rows[3]!.amount).toBe(12.3); expect(rows[3]!.flow).toBe("expense");
  });
});
