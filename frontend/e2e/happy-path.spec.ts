import { expect, request, test, type Page } from "@playwright/test";

const API_URL = "http://localhost:8080";

interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
}

async function registerUser(prefix: string): Promise<TestUser> {
  const api = await request.newContext();
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `${username}@example.com`;
  const password = "supersecret123";

  const response = await api.post(`${API_URL}/users`, { data: { username, email, password } });
  if (!response.ok()) {
    throw new Error(`register failed: ${response.status()} ${await response.text()}`);
  }
  const user = (await response.json()) as { id: string; username: string; email: string };
  await api.dispose();

  return { ...user, password };
}

async function login(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/chat$/);
}

/** Scopes to the conversation pane, since the sidebar's last-message preview can echo the same text. */
function conversationPane(page: Page) {
  return page.getByRole("main");
}

test("two users can message, send voice notes, and call each other in realtime", async ({ browser }) => {
  const alice = await registerUser("alice");
  const bob = await registerUser("bob");

  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();
  const aliceMain = conversationPane(alicePage);
  const bobMain = conversationPane(bobPage);

  await login(alicePage, alice);
  await login(bobPage, bob);

  // Alice starts a direct conversation with Bob via real user search. Both
  // are already connected before this, with no conversation between them
  // yet — membership itself (not a reconnect) is what syncs their presence.
  await alicePage.getByRole("button", { name: "+ New conversation" }).click();
  await alicePage.getByLabel("Search people by username").fill(bob.username);
  await alicePage.getByRole("option", { name: new RegExp(bob.username) }).click();
  await alicePage.getByRole("button", { name: "Start conversation" }).click();
  await expect(alicePage).toHaveURL(/\/chat\/.+/);

  await expect(alicePage.getByText("Online", { exact: true })).toBeVisible();

  // Alice sends the first message; Bob's sidebar picks up the new
  // conversation reactively (message.created invalidates his conversation
  // list too, since he's a member) without needing a reload.
  const aliceComposer = alicePage.getByRole("textbox", { name: "Message" });
  await aliceComposer.fill("hey bob, it's alice");
  await aliceComposer.press("Enter");

  await bobPage.getByRole("link", { name: new RegExp(alice.username) }).click();
  await expect(bobMain.getByText("hey bob, it's alice")).toBeVisible({ timeout: 10_000 });
  await expect(bobPage.getByText("Online", { exact: true })).toBeVisible();

  // Bob typing shows up on Alice's side, then his reply arrives.
  const bobComposer = bobPage.getByRole("textbox", { name: "Message" });
  await bobComposer.fill("typing a reply");
  await expect(aliceMain.getByText(new RegExp(`${bob.username} is typing`))).toBeVisible({ timeout: 5_000 });
  await bobComposer.press("Enter");
  await expect(aliceMain.getByText("typing a reply")).toBeVisible({ timeout: 10_000 });

  // Alice edits her message; the edit propagates to Bob too.
  await aliceMain.getByText("hey bob, it's alice").hover();
  await aliceMain.getByRole("button", { name: "edit" }).click();
  const editBox = aliceMain.getByRole("textbox").last();
  await editBox.fill("hey bob, edited!");
  await editBox.press("Enter");

  await expect(aliceMain.getByText("hey bob, edited!")).toBeVisible();
  await expect(aliceMain.getByText("edited", { exact: false })).toBeVisible();
  await expect(bobMain.getByText("hey bob, edited!")).toBeVisible({ timeout: 10_000 });

  // Bob sends a voice message; Alice can see and play it.
  await bobPage.getByRole("button", { name: "Record a voice message" }).click();
  await bobPage.waitForTimeout(1200);
  await bobPage.getByRole("button", { name: "Send voice message" }).click();
  await expect(aliceMain.getByRole("button", { name: "Play voice message" })).toBeVisible({ timeout: 10_000 });

  // Alice calls Bob; he gets a ring, accepts, and both land in an active call.
  await alicePage.getByRole("button", { name: "Start voice call" }).click();
  await expect(bobPage.getByRole("alertdialog", { name: new RegExp(`Incoming call from ${alice.username}`) })).toBeVisible({
    timeout: 10_000,
  });
  await bobPage.getByRole("button", { name: "Accept call" }).click();

  await expect(alicePage.getByText("in call", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(bobPage.getByText("in call", { exact: true })).toBeVisible({ timeout: 10_000 });

  await alicePage.getByRole("button", { name: "Leave call" }).click();
  await expect(alicePage.getByRole("button", { name: "Leave call" })).toHaveCount(0);

  // Alice deletes her message; it disappears on both sides.
  await aliceMain.getByText("hey bob, edited!").hover();
  await aliceMain.getByRole("button", { name: "delete", exact: true }).click();
  await aliceMain.getByRole("button", { name: "yes" }).click();

  await expect(aliceMain.getByText("hey bob, edited!")).toHaveCount(0);
  await expect(bobMain.getByText("hey bob, edited!")).toHaveCount(0, { timeout: 10_000 });

  await aliceContext.close();
  await bobContext.close();
});
