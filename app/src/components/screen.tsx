import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { RoleShell } from "@/components/ui/role-shell";
import { type } from "@/theme";
import { Text } from "react-native";

export { Card };

/** Plain page with a back header and no role nav. */
export function Screen({ title = "Kvali", children }: { title?: string; children: ReactNode }) {
  return <RoleShell title={title}>{children}</RoleShell>;
}

export function Placeholder({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Screen title={title}>
      <Card>
        <Text style={type.label}>COMING NEXT</Text>
        {lines.map((l) => (
          <Text key={l} style={type.body}>
            {"• "}
            {l}
          </Text>
        ))}
      </Card>
    </Screen>
  );
}
