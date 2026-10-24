import { router } from "expo-router";
import { ActivityIndicator, ScrollView } from "react-native";
import { Button, Card, Empty, ListRow } from "@/components/ui";
import { htmlToPlain } from "@/lib/format";
import { useSignatures } from "@/lib/queries";

export default function SignaturesScreen() {
  const signatures = useSignatures();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {signatures.isPending ? (
        <ActivityIndicator />
      ) : !signatures.data?.length ? (
        <Empty icon="create-outline" title="Aucune signature" hint="Créez votre signature : elle s'ajoute automatiquement à vos e-mails." />
      ) : (
        <Card>
          {signatures.data.map((s) => (
            <ListRow key={s.id} title={s.name} subtitle={htmlToPlain(s.html).slice(0, 80)} onPress={() => router.push({ pathname: "/settings/signature", params: { id: s.id } })} />
          ))}
        </Card>
      )}
      <Button title="Nouvelle signature" icon="add" onPress={() => router.push("/settings/signature")} />
    </ScrollView>
  );
}
