// One-time Google sign-in. Opens the browser, you approve, the token is saved.
import { authorizeInteractive } from "../lib/google-auth.mjs";

authorizeInteractive()
  .then(() => {
    console.log("\nהתחברות הושלמה. עכשיו אפשר להריץ: npm run calendars");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n✗ ההתחברות נכשלה:", err.message);
    process.exit(1);
  });
