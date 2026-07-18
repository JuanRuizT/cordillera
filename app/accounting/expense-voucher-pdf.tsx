"use client"

import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer"
import type { ExpenseVoucherData } from "./actions"

const NAVY = "#1f3864"
const LAVENDER = "#dde3f0"
const BORDER = "#8c8c8c"

const BUILDING_NAME = "EDIFICIO CORDILLERA - PROPIEDAD HORIZONTAL"
const NIT = "902000058-9"
const ADDRESS = "Carrera 24 # 64A-41"
const CITY = "Manizales, Caldas - Colombia"

function formatVoucherDate(iso: string) {
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

  footer: { flexDirection: "row", marginTop: 16, alignItems: "stretch" },
  payment: { flex: 1, paddingRight: 14 },
  paymentLabel: { fontFamily: "Helvetica-Bold" },
  sign: { flex: 1, borderWidth: 0.5, borderColor: BORDER, flexDirection: "column" },
  signTop: { textAlign: "center", padding: 4 },
  signSpace: { flexGrow: 1, minHeight: 48 },
})

export function ExpenseVoucherPDF({ voucher }: { voucher: ExpenseVoucherData }) {
  const number = String(voucher.number).padStart(4, "0")
  const amountFormatted = `$${formatCurrency(voucher.amount)}`

  return (
    <Document title={`Comprobante de Egreso ${number}`}>
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
            <Text style={s.title}>Comprobante de Egreso</Text>
            <View style={s.numWrap}>
              <Text>Número:</Text>
              <Text style={s.numValue}>{number}</Text>
            </View>
          </View>

          {/* Pagado a */}
          <View style={s.section}>
            <Text style={s.bar}>Pagado A</Text>
            <View style={s.info}>
              <View style={s.infoRow}>
                <Text style={s.infoKey}>Nombre</Text>
                <Text style={s.infoVal}>{voucher.contractorName}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoKey}>C.C o NIT</Text>
                <Text style={s.infoVal}>{voucher.contractorIdNumber}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoKey}>Fecha</Text>
                <Text style={s.infoVal}>{formatVoucherDate(voucher.date)}</Text>
              </View>
            </View>
          </View>

          {/* Concepto + valor + total */}
          <View style={[s.section, s.tableTop]}>
            <View style={s.row}>
              <Text style={[s.cell, s.navyCell, { flex: 1 }]}>Por Concepto De:</Text>
              <Text style={[s.cell, s.navyCell, s.right, { width: 110 }]}>Valor</Text>
            </View>
            <View style={s.row}>
              <Text style={[s.cell, { flex: 1 }]}>{voucher.concept}</Text>
              <Text style={[s.cell, s.right, { width: 110 }]}>{amountFormatted}</Text>
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
              <Text style={[s.cell, s.right, s.bold, { flex: 1 }]}>TOTAL</Text>
              <Text style={[s.cell, s.right, s.bold, { width: 110 }]}>{amountFormatted}</Text>
            </View>
          </View>

          {/* Forma de pago + firma beneficiario */}
          <View style={s.footer}>
            <View style={s.payment}>
              <Text>
                <Text style={s.paymentLabel}>Forma de Pago: </Text>
                {voucher.paymentMethod}
              </Text>
            </View>
            <View style={s.sign}>
              <Text style={s.signTop}>Firma Beneficiario</Text>
              <View style={s.signSpace} />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function generateVoucherBlob(voucher: ExpenseVoucherData) {
  return pdf(<ExpenseVoucherPDF voucher={voucher} />).toBlob()
}
