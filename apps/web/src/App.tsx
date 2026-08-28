import { useEffect, useState } from "react";
import { api, type SessionSummary } from "./api";
import Home from "./components/Home";
import Wizard from "./components/Wizard";
import Live from "./components/Live";

type View = { name: "home" } | { name: "wizard" } | { name: "live"; sessionId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function refreshSessions() {
    const list = await api.sessions();
    setSessions(list);
    return list;
  }

  useEffect(() => {
    refreshSessions()
      .then((list) => {
        const live = list.find((s) => s.status === "LIVE");
        if (live) setView({ name: "live", sessionId: live.id });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state">Caricamento…</div>;

  if (view.name === "home") {
    return (
      <Home
        sessions={sessions}
        onNewAuction={() => setView({ name: "wizard" })}
        onOpen={(id) => setView({ name: "live", sessionId: id })}
        onRefresh={refreshSessions}
      />
    );
  }

  if (view.name === "wizard") {
    return (
      <Wizard
        onCreated={(session) => setView({ name: "live", sessionId: session.id })}
        onCancel={() => setView({ name: "home" })}
      />
    );
  }

  return (
    <Live
      sessionId={view.sessionId}
      onHome={() => {
        refreshSessions();
        setView({ name: "home" });
      }}
    />
  );
}
