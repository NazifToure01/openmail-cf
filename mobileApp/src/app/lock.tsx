import { useEffect } from "react";
import { View } from "react-native";
import { WelcomeScreen } from "@/components/screen";
import { Button } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Verrouillage biométrique à l'ouverture de l'app */
export default function LockScreen() {
  const { unlock, signOut, user } = useSession();

  useEffect(() => {
    void unlock();
  }, [unlock]);

  return (
    <WelcomeScreen title="Messagerie verrouillée" subtitle={user ? `Bonjour ${user.name}, déverrouillez pour accéder à vos e-mails.` : "Déverrouillez pour accéder à vos e-mails."}>
      <View style={{ gap: 12 }}>
        <Button title="Déverrouiller" icon="finger-print" onPress={() => void unlock()} />
        <Button title="Se déconnecter" variant="ghost" onPress={() => void signOut()} />
      </View>
    </WelcomeScreen>
  );
}
