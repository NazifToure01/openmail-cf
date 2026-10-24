import { useState } from "react";
import { View } from "react-native";
import { WelcomeScreen } from "@/components/screen";
import { useTheme } from "@/components/theme";
import { AppText, Button, Field } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function LoginScreen() {
  const { signIn } = useSession();
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <WelcomeScreen title="Connexion" subtitle="Connectez-vous pour envoyer et recevoir les e-mails de vos domaines.">
      <View style={{ gap: 14 }}>
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
        />
        <Field
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {error && <AppText variant="small" color={t.danger}>{error}</AppText>}
        <Button title="Se connecter" onPress={submit} loading={loading} disabled={!email || !password} />
        <AppText variant="caption" color={t.subtle} style={{ textAlign: "center" }}>
          Pas encore de compte ? Demandez-le à l&apos;administrateur de votre messagerie.
        </AppText>
      </View>
    </WelcomeScreen>
  );
}
