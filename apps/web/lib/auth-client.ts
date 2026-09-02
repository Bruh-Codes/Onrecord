import { createAuthClient } from "better-auth/react";
import { adminClient, organizationClient, phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [phoneNumberClient(), organizationClient(), adminClient()],
});
