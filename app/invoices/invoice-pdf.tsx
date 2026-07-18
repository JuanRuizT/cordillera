"use client"

import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer"
import type { InvoiceData } from "./actions"

const NAVY = "#1f3864"
const LAVENDER = "#dde3f0"
const BORDER = "#8c8c8c"

const BUILDING_NAME = "EDIFICIO CORDILLERA - PROPIEDAD HORIZONTAL"
const NIT = "902000058-9"
const ADDRESS = "Carrera 24 # 64A-41"
const CITY = "Manizales, Caldas - Colombia"

function formatInvoiceDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const month = date.toLocaleDateString("es-CO", { month: "long" })
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1)
  return `${d} de ${monthCapitalized} del ${y}`
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica", color: "#000" },
  doc: { borderWidth: 0.75, borderColor: BORDER, padding: 16, flexGrow: 1 },

  head: { textAlign: "center" },
  building: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY, textTransform: "uppercase", letterSpacing: 0.3 },
  sub: { fontSize: 9, marginTop: 1.5 },
  italic: { fontSize: 8.5, fontFamily: "Helvetica-Oblique", marginTop: 1 },

  titleBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1.2, borderBottomWidth: 1.2, borderColor: NAVY, paddingVertical: 5, marginTop: 8 },
  title: { fontSize: 11, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  numWrap: { flexDirection: "row", fontSize: 10, fontFamily: "Helvetica-Bold" },
  numValue: { marginLeft: 50 },

  section: { marginTop: 10 },
  bar: { backgroundColor: LAVENDER, fontFamily: "Helvetica-Bold", textTransform: "uppercase", paddingVertical: 3, paddingHorizontal: 6, borderWidth: 0.5, borderColor: BORDER },
  info: { borderWidth: 0.5, borderTopWidth: 0, borderColor: BORDER, paddingVertical: 3, paddingHorizontal: 6 },
  infoRow: { flexDirection: "row", paddingVertical: 1.5 },
  infoKey: { width: 100, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  infoVal: { flex: 1 },

  tableTop: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: BORDER },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER, paddingVertical: 3, paddingHorizontal: 6 },
  navyCell: { backgroundColor: NAVY, color: "#fff", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3 },
  right: { textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },

  summaryBox: { marginTop: 10, borderWidth: 0.5, borderColor: BORDER, padding: 6, flexDirection: "row", justifyContent: "space-between" },
  summaryCol: { flexDirection: "column" },
  summaryLabel: { fontSize: 8, color: "#555" },
  summaryVal: { fontFamily: "Helvetica-Bold" },

  footer: { marginTop: 16, borderWidth: 0.5, borderColor: BORDER, padding: 8 },
  footerLabel: { fontFamily: "Helvetica-Bold" },
})

export function InvoicePDF({ invoice }: { invoice: InvoiceData }) {
  const number = String(invoice.number ?? 0).padStart(4, "0")
  const totalFormatted = `$${formatCurrency(invoice.totalAmount)}`
  const netFormatted = `$${formatCurrency(invoice.netAmount)}`

  return (
    <Document title={`Cuenta de Cobro ${number}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.doc}>
          {/* Header */}
          <View style={s.head}>
            <Text style={s.building}>{BUILDING_NAME}</Text>
            <Text style={s.sub}>NIT: {NIT}</Text>
            <Text style={s.italic}>{ADDRESS}</Text>
            <Text style={s.italic}>{CITY}</Text>
          </View>

          {/* Title + number */}
          <View style={s.titleBar}>
            <Text style={s.title}>Cuenta de Cobro</Text>
            <View style={s.numWrap}>
              <Text>Número:</Text>
              <Text style={s.numValue}>{number}</Text>
            </View>
          </View>

          {/* Cobrado por */}
          <View style={s.section}>
            <Text style={s.bar}>Cobrado Por</Text>
            <View style={s.info}>
              <View style={s.infoRow}>
                <Text style={s.infoKey}>Nombre</Text>
                <Text style={s.infoVal}>{invoice.contractorName}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoKey}>C.C o NIT</Text>
                <Text style={s.infoVal}>{invoice.contractorIdNumber}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoKey}>Fecha</Text>
                <Text style={s.infoVal}>{formatInvoiceDate(invoice.date)}</Text>
              </View>
            </View>
          </View>

          {/* Concepto + valor + retención + neto */}
          <View style={[s.section, s.tableTop]}>
            <View style={s.row}>
              <Text style={[s.cell, s.navyCell, { flex: 1 }]}>Por Concepto De:</Text>
              <Text style={[s.cell, s.navyCell, s.right, { width: 110 }]}>Valor</Text>
            </View>
            <View style={s.row}>
              <Text style={[s.cell, { flex: 1 }]}>{invoice.concept}</Text>
              <Text style={[s.cell, s.right, { width: 110 }]}>{totalFormatted}</Text>
            </View>
            {invoice.retentionRate != null && (
              <View style={s.row}>
                <Text style={[s.cell, { flex: 1 }]}>Retención en la fuente {invoice.retentionRate}%</Text>
                <Text style={[s.cell, s.right, { width: 110 }]}>-${formatCurrency(invoice.retentionAmount)}</Text>
              </View>
            )}
            <View style={s.row}>
              <Text style={[s.cell, s.right, s.bold, { flex: 1 }]}>
                {invoice.retentionRate != null ? "NETO A PAGAR" : "TOTAL"}
              </Text>
              <Text style={[s.cell, s.right, s.bold, { width: 110 }]}>
                {invoice.retentionRate != null ? netFormatted : totalFormatted}
              </Text>
            </View>
          </View>

          {/* Total / abonado / pendiente */}
          <View style={s.summaryBox}>
            <View style={s.summaryCol}>
              <Text style={s.summaryLabel}>Total cuenta de cobro</Text>
              <Text>{totalFormatted}</Text>
            </View>
            <View style={s.summaryCol}>
              <Text style={s.summaryLabel}>Abonado</Text>
              <Text>${formatCurrency(invoice.paid)}</Text>
            </View>
            <View style={s.summaryCol}>
              <Text style={s.summaryLabel}>Saldo pendiente</Text>
              <Text style={s.summaryVal}>${formatCurrency(invoice.pending)}</Text>
            </View>
          </View>

          {/* Abonos */}
          {invoice.abonos.length > 0 && (
            <View style={[s.section, s.tableTop]}>
              <View style={s.row}>
                <Text style={[s.cell, s.navyCell, { width: 90 }]}>Fecha</Text>
                <Text style={[s.cell, s.navyCell, { width: 90 }]}>Comprobante</Text>
                <Text style={[s.cell, s.navyCell, s.right, { flex: 1 }]}>Monto</Text>
              </View>
              {invoice.abonos.map((a) => (
                <View style={s.row} key={a.id}>
                  <Text style={[s.cell, { width: 90 }]}>{formatInvoiceDate(a.date)}</Text>
                  <Text style={[s.cell, { width: 90 }]}>{a.voucherNumber != null ? String(a.voucherNumber).padStart(4, "0") : "—"}</Text>
                  <Text style={[s.cell, s.right, { flex: 1 }]}>${formatCurrency(a.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Datos bancarios / notas */}
          {(invoice.bankInfo || invoice.notes) && (
            <View style={s.footer}>
              {invoice.bankInfo && (
                <Text>
                  <Text style={s.footerLabel}>Datos bancarios: </Text>
                  {invoice.bankInfo}
                </Text>
              )}
              {invoice.notes && (
                <Text style={{ marginTop: invoice.bankInfo ? 4 : 0 }}>
                  <Text style={s.footerLabel}>Notas: </Text>
                  {invoice.notes}
                </Text>
              )}
            </View>
          )}
        </View>
      </Page>
    </Document>
  )
}

export async function generateInvoiceBlob(invoice: InvoiceData) {
  return pdf(<InvoicePDF invoice={invoice} />).toBlob()
}
