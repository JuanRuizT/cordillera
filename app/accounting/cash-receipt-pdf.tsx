"use client"

import { Document, Page, View, Text, Image, StyleSheet, pdf } from "@react-pdf/renderer"
import type { CashReceiptData } from "./actions"

const NAVY = "#1f3864"
const LAVENDER = "#dde3f0"
const BORDER = "#8c8c8c"

const BUILDING_NAME = "EDIFICIO CORDILLERA - PROPIEDAD HORIZONTAL"
const NIT = "902000058-9"
const ADDRESS = "Carrera 24 # 64A-41"
const CITY = "Manizales, Caldas - Colombia"

function formatReceiptDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const month = date.toLocaleDateString("es-CO", { month: "long" })
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1)
  return `${monthCapitalized} ${d} del ${y}`
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function capitalizeWords(str: string) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
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

  // generic table (top border + left border on container; right + bottom on cells)
  tableTop: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: BORDER },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER, paddingVertical: 3, paddingHorizontal: 6 },
  navyCell: { backgroundColor: NAVY, color: "#fff", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3 },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },

  bottom: { flexDirection: "row", marginTop: 10, alignItems: "stretch" },
  colLeft: { flex: 1, marginRight: 14 },
  colRight: { flex: 1, flexDirection: "column" },

  gridCell: { flex: 1, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER, paddingVertical: 3, paddingHorizontal: 4, fontSize: 8, textAlign: "center", minHeight: 16 },
  gridHead: { fontFamily: "Helvetica-Bold", textTransform: "uppercase" },

  payAmount: { width: 60, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER, paddingVertical: 3, paddingHorizontal: 4, fontSize: 8, textAlign: "right" },

  sign: { marginTop: 16, borderWidth: 0.5, borderColor: BORDER, flexGrow: 1, flexDirection: "column" },
  signTop: { textAlign: "center", padding: 4 },
  signSpace: { flexGrow: 1, minHeight: 40, alignItems: "center", justifyContent: "center" },
  signImg: { width: 150 },
  signBottom: { textAlign: "center", padding: 4, fontFamily: "Helvetica-Bold", borderTopWidth: 0.5, borderColor: BORDER },
})

export function CashReceiptPDF({
  receipt,
  signatureDataUrl,
}: {
  receipt: CashReceiptData
  signatureDataUrl?: string | null
}) {
  const receiptNumber = String(receipt.number).padStart(4, "0")
  const amountFormatted = `$${formatCurrency(receipt.amount)}`

  return (
    <Document title={`Recibo de Caja ${receiptNumber}`}>
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
          <Text style={s.title}>Recibo de Caja</Text>
          <View style={s.numWrap}>
            <Text>Número:</Text>
            <Text style={s.numValue}>{receiptNumber}</Text>
          </View>
        </View>

        {/* Recibido de */}
        <View style={s.section}>
          <Text style={s.bar}>Recibido De</Text>
          <View style={s.info}>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>Nombre</Text>
              <Text style={[s.infoVal, { textTransform: "uppercase" }]}>{receipt.recipientName || "—"}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>Inmueble</Text>
              <Text style={s.infoVal}>{receipt.unit || "—"}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoKey}>Fecha</Text>
              <Text style={s.infoVal}>{formatReceiptDate(receipt.date)}</Text>
            </View>
          </View>
        </View>

        {/* Concepto + valor + letras */}
        <View style={[s.section, s.tableTop]}>
          <View style={s.row}>
            <Text style={[s.cell, s.navyCell, { flex: 1 }]}>Por Concepto De:</Text>
            <Text style={[s.cell, s.navyCell, s.right, { width: 110 }]}>Valor Neto</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cell, { flex: 1 }]}>{receipt.concept}</Text>
            <Text style={[s.cell, s.right, s.bold, { width: 110 }]}>{amountFormatted}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cell, { flex: 1 }]}> </Text>
            <Text style={[s.cell, { width: 110 }]}> </Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cell, { flex: 1 }]}> </Text>
            <Text style={[s.cell, { width: 110 }]}> </Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cell, s.bold, { width: 120, textTransform: "uppercase" }]}>Valor en Letras</Text>
            <Text style={[s.cell, { flex: 1 }]}>{capitalizeWords(receipt.amountInWords)}</Text>
            <Text style={[s.cell, { width: 110 }]}> </Text>
          </View>
        </View>

        {/* Bottom: accounting grid + payment/signature */}
        <View style={s.bottom}>
          {/* Left grid */}
          <View style={s.colLeft}>
            <View style={s.tableTop}>
              <View style={s.row}>
                <Text style={[s.gridCell, s.gridHead]}>Cod. Cta</Text>
                <Text style={[s.gridCell, s.gridHead]}>Débito</Text>
                <Text style={[s.gridCell, s.gridHead]}>Crédito</Text>
              </View>
              {Array.from({ length: 8 }).map((_, i) => (
                <View style={s.row} key={i}>
                  <Text style={s.gridCell}> </Text>
                  <Text style={s.gridCell}> </Text>
                  <Text style={s.gridCell}> </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Right: payment + signature */}
          <View style={s.colRight}>
            <View style={s.tableTop}>
              <View style={s.row}>
                <Text style={s.gridCell}> </Text>
                <Text style={s.gridCell}> </Text>
                <Text style={s.payAmount}> </Text>
              </View>
              <View style={s.row}>
                <Text style={s.gridCell}> </Text>
                <Text style={s.gridCell}> </Text>
                <Text style={s.payAmount}> </Text>
              </View>
              <View style={s.row}>
                <Text style={[s.gridCell, s.bold, { flex: 2, textAlign: "left", textTransform: "uppercase" }]}>{receipt.paymentMethod}</Text>
                <Text style={[s.payAmount, s.bold]}>{amountFormatted}</Text>
              </View>
            </View>

            <View style={s.sign}>
              <Text style={s.signTop}>Firma y Sello</Text>
              <View style={s.signSpace}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image is not an HTML img */}
                {signatureDataUrl ? <Image src={signatureDataUrl} style={s.signImg} /> : null}
              </View>
              <Text style={s.signBottom}>Administrador</Text>
            </View>
          </View>
        </View>
       </View>
      </Page>
    </Document>
  )
}

export async function generateReceiptBlob(receipt: CashReceiptData, signatureDataUrl?: string | null) {
  return pdf(<CashReceiptPDF receipt={receipt} signatureDataUrl={signatureDataUrl} />).toBlob()
}
