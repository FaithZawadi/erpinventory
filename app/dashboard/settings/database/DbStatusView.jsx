"use client";
import { Page, SectionHeader, StatGrid, Stat, DataTable, Badge, Alert } from "@/components/erp-ui";

// Client view for the Postgres migration dashboard. Renders live Mongo vs
// Postgres row counts per module using the ERP UI kit.
export default function DbStatusView({ rows, pgAvailable, pgError, activeBackend }) {
  const totalMongo = rows.reduce((s, r) => s + (r.mongo || 0), 0);
  const totalPg = rows.reduce((s, r) => s + (r.postgres || 0), 0);

  const tableRows = rows.map((r) => {
    const match = pgAvailable && r.mongo === r.postgres;
    return [
      r.label,
      r.mongo ?? "—",
      pgAvailable ? r.postgres ?? "—" : "—",
      pgAvailable ? (
        <Badge variant={match ? "green" : "amber"}>{match ? "in sync" : "differs"}</Badge>
      ) : (
        <Badge variant="default">n/a</Badge>
      ),
    ];
  });

  return (
    <Page>
      <SectionHeader
        title="Database — Postgres migration status"
        sub="Live row counts, MongoDB vs PostgreSQL, per migrated module"
        action={<Badge variant={activeBackend === "postgres" ? "green" : "navy"}>Reads: {activeBackend.toUpperCase()}</Badge>}
      />

      {!pgAvailable && (
        <Alert type="warning">
          PostgreSQL not reachable ({pgError || "no connection"}). Showing MongoDB counts only. Set
          DATABASE_URL and run the migrations to enable the Postgres column.
        </Alert>
      )}

      <StatGrid>
        <Stat label="Modules tracked" value={rows.length} icon="📦" />
        <Stat label="MongoDB rows" value={totalMongo.toLocaleString()} variant="blue" icon="🍃" />
        <Stat label="PostgreSQL rows" value={pgAvailable ? totalPg.toLocaleString() : "—"} variant="green" icon="🐘" />
      </StatGrid>

      <DataTable headers={["Module", "MongoDB", "PostgreSQL", "Parity"]} rows={tableRows} searchable={false} />

      <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 14 }}>
        The active read backend is controlled by the <code>DATA_BACKEND</code> environment variable
        (mongo by default, postgres to cut over). Counts here read both databases directly regardless
        of that flag, so you can confirm parity before flipping any page.
      </p>
    </Page>
  );
}
