import { expect, test, type Page } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page) {
  await page.goto("/");
  const tokenInput = page.locator("#login-token").or(page.getByRole("textbox", { name: "Token" }));
  if (!(await tokenInput.isVisible().catch(() => false))) {
    const signInButton = page.getByRole("button", { name: "Sign in" });
    if (await signInButton.isVisible().catch(() => false)) {
      await signInButton.click();
    }
  }
  await tokenInput.fill(SEEDED_PLUE_TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.getByTestId("auth-status").locator(".auth-name"),
  ).toHaveText("Alice Dev");
}

test("streams a real assistant reply through the real Worker", async ({
  page,
}) => {
  let chatResponse:
    | { status: number; contentType: string; bodySnippet: Promise<string> }
    | undefined;

  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname !== "/api/chat") {
      return;
    }
    chatResponse = {
      status: response.status(),
      contentType: response.headers()["content-type"] ?? "",
      bodySnippet: response
        .text()
        .then((body) => body.slice(0, 1_000))
        .catch(() => ""),
    };
  });

  await signIn(page);

  await page
    .getByRole("textbox", { name: "Message Smithers" })
    .fill("Reply with one short sentence.");

  const apiResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/chat",
    { timeout: 90_000 },
  );
  await page.getByRole("textbox", { name: "Message Smithers" }).press("Enter");
  const apiResponse = await apiResponsePromise;

  expect(apiResponse.status()).toBe(200);
  expect(apiResponse.headers()["content-type"]).toMatch(
    /text\/event-stream|application\/x-ndjson|text\/plain/,
  );

  const assistantBubble = page
    .locator(".message.assistant .bubble:not(.typing)")
    .last();
  await expect
    .poll(async () => (await assistantBubble.textContent())?.trim() ?? "", {
      timeout: 90_000,
    })
    .toMatch(/\S/);

  const assistantText = ((await assistantBubble.textContent()) ?? "").trim();
  expect(assistantText).not.toContain("⚠️");
  expect(assistantText).not.toMatch(
    /chat request failed|something went wrong/i,
  );

  expect(chatResponse?.status).toBe(200);
  expect(chatResponse?.contentType).toMatch(
    /text\/event-stream|application\/x-ndjson|text\/plain/,
  );
  await expect(chatResponse?.bodySnippet).resolves.toMatch(/\S/);
});
