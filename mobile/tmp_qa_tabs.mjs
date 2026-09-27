// Log in as admin, open Content, then visit each tab and screenshot.
export default async function run(page, ui) {
  const clickText = async (text) => {
    const el = page.getByText(text, { exact: true });
    if (await el.count() > 0) { await el.first().click({ timeout: 5000 }); return true; }
    return false;
  };

  try {
    const g = page.getByText('Open App', { exact: false });
    if (await g.count()) await g.first().click();
  } catch (e) { }
  await page.waitForTimeout(3000);
  await clickText('Log in');
  await page.waitForTimeout(2500);
  await page.getByPlaceholder(/email/i).first().fill('admin@school.edu');
  await page.getByPlaceholder(/password/i).first().fill('Admin@123');
  await page.getByText(/log ?in|sign ?in/i).last().click();
  await page.waitForTimeout(5000);
  await clickText('Content');
  await page.waitForTimeout(3000);

  const results = {};

  await clickText('Notes');
  await page.waitForTimeout(2000);
  results.notes = await page.evaluate(() => document.body.innerText.slice(0, 700));

  await clickText('AI Coach');
  await page.waitForTimeout(2500);
  results.coach = await page.evaluate(() => document.body.innerText.slice(0, 900));

  await page.screenshot({ path: 'qa-admin-content.png', fullPage: false });
  results.screenshot = 'qa-admin-content.png';

  return results;
}
