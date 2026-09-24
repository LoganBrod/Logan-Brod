import { Chat } from "@/components/Chat";
export default function ChatPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
      <Chat />
    </div>
  );
}
