import type { Metadata } from "next";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { loadAssistantHistory } from "@/lib/assistant";

export const metadata: Metadata = { title: "Asisten — RobloxOps" };

export default async function AssistantPage() {
  const history = await loadAssistantHistory();
  return (
    <AssistantPanel
      initialMessages={history.messages}
      initialThreadId={history.threadId}
    />
  );
}
