import { Shell } from "@/components/os/os-ui";

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
