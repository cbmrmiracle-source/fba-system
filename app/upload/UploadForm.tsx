"use client";
import { useState } from "react";

type Result = { file: string; ok: boolean; message: string };

export default function UploadForm() {
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: new FormData(e.currentTarget) });
      const body = await res.json();
      setResults(body.results ?? [{ file: "", ok: false, message: body.error ?? "Upload failed" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="controls">
      <input type="file" name="files" multiple required accept=".txt,.tsv,.csv,.xlsx,.xls" />
      <label>Sales date <input type="date" name="date" defaultValue={yesterday} /></label>
      <button type="submit" disabled={busy}>{busy ? "Loading..." : "Upload"}</button>
      {results.length > 0 && (
        <ul style={{ width: "100%" }}>
          {results.map((r, i) => <li key={i} className={r.ok ? "ok" : "error"}>{r.file}: {r.message}</li>)}
        </ul>
      )}
    </form>
  );
}
