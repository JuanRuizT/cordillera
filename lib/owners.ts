// Single source of truth for property-owner data. `prisma/seed.ts` seeds the
// `Owner` DB table from this file; `lib/accounting/classification-context.ts`
// derives its bank-alias classification hints from it too.
export interface OwnerData {
  unit: string
  aptArea: number
  aptCoefficient: number
  garageArea: number
  garageCoefficient: number
  totalCoefficient: number
  name: string
  cedula: string
  address: string
  phone: string
  email: string | null
  // Fragments seen in bank transfer descriptions (e.g. "PAGO LLAVE X"). Only used as a
  // classification hint for the AI — never persisted to the DB (Owner has no such column).
  bankAliases: string[]
}

export const OWNERS: OwnerData[] = [
  {
    unit: "Apartamento 101",
    aptArea: 183.5,
    aptCoefficient: 23.391,
    garageArea: 20,
    garageCoefficient: 2.549,
    totalCoefficient: 25.940,
    name: "Oscar Trujillo Gómez",
    cedula: "10243903",
    address: "Cra 24 # 65A - 41 Apto 101",
    phone: "3122976341",
    email: null,
    bankAliases: ["OSCAR TRUJILLO"],
  },
  {
    unit: "Apartamento 201",
    aptArea: 165.0,
    aptCoefficient: 21.033,
    garageArea: 20,
    garageCoefficient: 2.549,
    totalCoefficient: 23.582,
    name: "Gloria del Carmen Tobon Vasquez",
    cedula: "29562991",
    address: "Cra 19 # 73 - 67",
    phone: "3108384307",
    email: "gctobon@gmail.com",
    // Juan Andrés Ruiz Tobón paga por esta unidad, no es el propietario: los alias identifican a
    // quien transfiere, así que se conservan aunque el propietario sea Gloria.
    bankAliases: ["JUAN RUIZ", "JUAN ANDRES", "RUIZ TOBON"],
  },
  {
    unit: "Apartamento 301",
    aptArea: 165.0,
    aptCoefficient: 21.033,
    garageArea: 20,
    garageCoefficient: 2.549,
    totalCoefficient: 23.582,
    name: "Beatriz Gómez Hoyos",
    cedula: "24325068",
    address: "Cra 24 # 65A - 41 Apto 301",
    phone: "3122960946",
    email: "mariabeatrizgomezh@gmail.com",
    // "JUAN PABLO" is the owner's son, who pays on her behalf (e.g. "PAGO LLAVE Juan Pablo"). The
    // payment still belongs to her — the concept and the receipt go in Beatriz's name.
    bankAliases: ["MARIA BEAT", "BEATRIZ", "JUAN PABLO"],
  },
  {
    unit: "Apartamento 401",
    aptArea: 165.0,
    aptCoefficient: 21.033,
    garageArea: 20,
    garageCoefficient: 2.549,
    totalCoefficient: 23.582,
    name: "Oscar Danilo Osorio Osorio",
    cedula: "10228342",
    address: "Cra 24 # 65A - 41 Apto 401",
    phone: "3006520832",
    email: "oscardani.osorio@gmail.com",
    bankAliases: ["OSCAR DANI", "OSCAR DANILO"],
  },
  {
    unit: "Local Comercial",
    aptArea: 26.0,
    aptCoefficient: 3.314,
    garageArea: 0,
    garageCoefficient: 0.0,
    totalCoefficient: 3.314,
    name: "Patricia Marín Álvarez",
    cedula: "30326504",
    address: "Cra 24 # 65A - 41 Local",
    phone: "3116477713",
    email: "pattymar2017@gmail.com",
    bankAliases: ["PATRICIA", "MARIN"],
  },
]
