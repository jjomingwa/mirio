import { expect, test } from "@playwright/test";

test("opening reaches the first world and launches course 1-1", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /CROWNTRAIL KINGDOM/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /새 모험 시작|모험 계속하기/ })
    .click();
  await page.keyboard.press("Space");
  await expect(page.getByText(/클리어 0\/54/)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Enter");
  await expect(page.getByText("1-1")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("바람개비 언덕")).toBeVisible();
});

test("settings remain usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "설정" }).click();
  await expect(page.getByRole("dialog", { name: "게임 설정" })).toBeVisible();
  await page.getByText("터치 조작 표시").click();
  await page.getByRole("button", { name: "완료" }).click();
});

test("restarting a paused course resumes the course clock", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /새 모험 시작|모험 계속하기/ })
    .click();
  await page.keyboard.press("Space");
  await expect(page.getByText(/클리어 0\/54/)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Enter");
  await expect(page.getByText("바람개비 언덕")).toBeVisible({ timeout: 5_000 });

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "일시정지 메뉴" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "코스 다시 시작" }).click();
  await expect(
    page.getByRole("dialog", { name: "일시정지 메뉴" }),
  ).toBeHidden();

  await expect
    .poll(async () => Number(await page.getByTestId("hud-time").innerText()))
    .toBeGreaterThan(300);
  const restartedAt = Number(await page.getByTestId("hud-time").innerText());
  await expect
    .poll(async () => Number(await page.getByTestId("hud-time").innerText()))
    .toBeLessThan(restartedAt);
});
