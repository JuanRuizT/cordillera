import { prisma } from "@/lib/db"
import { BaseLayout } from "@/components/base-layout"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

function fmt(n: number, decimals = 3) {
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export default async function BuildingDataPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const owners = await prisma.owner.findMany({
    orderBy: { unit: "asc" },
  })

  const totalAptArea = owners.reduce((s, o) => s + o.aptArea, 0)
  const totalGarageArea = owners.reduce((s, o) => s + o.garageArea, 0)
  const totalAptCoeff = owners.reduce((s, o) => s + o.aptCoefficient, 0)
  const totalGarageCoeff = owners.reduce((s, o) => s + o.garageCoefficient, 0)
  const totalCoeff = owners.reduce((s, o) => s + o.totalCoefficient, 0)

  return (
    <BaseLayout wide>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Datos Edificio</h1>
          <p className="text-sm text-muted-foreground">
            {owners.length} {owners.length === 1 ? "unidad" : "unidades"} registradas
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Unidad</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Área Apto (m²)</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Coef. Apto (%)</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Área Garaje (m²)</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Coef. Garaje (%)</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Coef. Total (%)</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Propietario</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Cédula</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Dirección</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Celular</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Correo</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((owner, i) => (
                <tr
                  key={owner.id}
                  className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{owner.unit}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {fmt(owner.aptArea, 1)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {fmt(owner.aptCoefficient)}%
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {fmt(owner.garageArea, 1)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {fmt(owner.garageCoefficient)}%
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-semibold">
                    {fmt(owner.totalCoefficient)}%
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{owner.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{owner.cedula}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{owner.address}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{owner.phone}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {owner.email ? (
                      <a
                        href={`mailto:${owner.email}`}
                        className="text-primary hover:underline"
                      >
                        {owner.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/50 font-semibold">
                <td className="px-4 py-3 whitespace-nowrap">Total Edificio</td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {fmt(totalAptArea, 1)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {fmt(totalAptCoeff)}%
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {fmt(totalGarageArea, 1)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {fmt(totalGarageCoeff)}%
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {fmt(totalCoeff)}%
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </BaseLayout>
  )
}
