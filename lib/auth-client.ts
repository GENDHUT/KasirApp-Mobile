import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

const API_URL = "https://www.alal-ala.my.id";

export const authClient = createAuthClient({
  baseURL: API_URL,

  plugins: [
    usernameClient(),

    expoClient({
      scheme: "kasirapp",
      storagePrefix: "kasirapp",
      storage: SecureStore,
    }),
  ],
});

export { API_URL };