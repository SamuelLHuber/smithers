import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
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
const totalSlides = manifest.length + 1;

async function expectCurrentSlide(page: Page, index: number) {
  await expect(page.getByText(`${index + 1} / ${totalSlides}`)).toBeVisible();
  await expect(page.getByTestId("slideshow-dots").locator("button").nth(index)).toHaveAttribute("aria-current", "true");
}

test("slideshow renders generated feature gifs and navigates from file url", async ({ page }) => {
  await page.goto(slideshowUrl);

  const slides = page.getByTestId("slideshow-slide");
  const dots = page.getByTestId("slideshow-dots").locator("button");
  await expect(slides).toHaveCount(totalSlides);
  await expect(dots).toHaveCount(totalSlides);
  await expectCurrentSlide(page, 0);

  await page.keyboard.press("ArrowRight");
  await expectCurrentSlide(page, 1);

  await page.keyboard.press("ArrowLeft");
  await expectCurrentSlide(page, 0);

  await page.getByTestId("slideshow-next").click();
  await expectCurrentSlide(page, 1);

  await page.getByTestId("slideshow-prev").click();
  await expectCurrentSlide(page, 0);

  for (let index = 0; index < manifest.length; index += 1) {
    await dots.nth(index + 1).click();
    await expectCurrentSlide(page, index + 1);
    const image = slides.nth(index + 1).locator("img");
    await expect(image).toHaveJSProperty("complete", true);
    await expect
      .poll(async () => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
});
