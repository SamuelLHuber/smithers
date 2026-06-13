import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ManifestEntry = {
  slug: string;
};

const repoRoot = resolve(import.meta.dirname, "../../../..");
const artifactRoot = resolve(repoRoot, "artifacts/feature-gifs");
const manifestPath = resolve(artifactRoot, "manifest.json");
const slideshowUrl = pathToFileURL(resolve(artifactRoot, "index.html")).toString();
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[];

test("slideshow renders generated feature gifs and navigates from file url", async ({ page }) => {
  await page.goto(slideshowUrl);

  const slides = page.getByTestId("slideshow-slide");
  await expect(slides).toHaveCount(manifest.length + 1);
  await expect(slides.nth(0)).toBeVisible();
  await expect(page.getByText(`1 / ${manifest.length + 1}`)).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(slides.nth(1)).toBeVisible();
  await expect(page.getByText(`2 / ${manifest.length + 1}`)).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(slides.nth(0)).toBeVisible();

  await page.getByTestId("slideshow-next").click();
  await expect(slides.nth(1)).toBeVisible();

  await page.getByTestId("slideshow-prev").click();
  await expect(slides.nth(0)).toBeVisible();

  await expect(page.getByTestId("slideshow-dots").locator("button")).toHaveCount(manifest.length + 1);

  for (let index = 0; index < manifest.length; index += 1) {
    await page.getByTestId("slideshow-dots").locator("button").nth(index + 1).click();
    await expect(slides.nth(index + 1)).toBeVisible();
    const image = slides.nth(index + 1).locator("img");
    await expect(image).toHaveJSProperty("complete", true);
    await expect
      .poll(async () => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
});
