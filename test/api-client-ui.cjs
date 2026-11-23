async function collectionAction(page, name, action) {
  await page
    .getByRole("button", {
      name: `Collection actions for ${name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("menu", { name: "Collection actions", exact: true })
    .getByRole("menuitem", { name: action, exact: true })
    .click();
}
async function openSection(page, label) {
  const section = page
    .locator(".api-sidebar-disclosure")
    .filter({ has: page.locator("summary").filter({ hasText: label }) });
  if (!(await section.evaluate((el) => el.open)))
    await section.locator(":scope > summary").click();
}
async function openTree(page, name) {
  const root = page.locator(".api-collection").filter({
    has: page
      .locator(":scope > summary")
      .filter({
        hasText: new RegExp(
          "^\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$",
        ),
      }),
  });
  if (!(await root.evaluate((el) => el.open)))
    await root.locator(":scope > summary").click();
  for (const folder of await root.locator(".api-folder").all())
    if (!(await folder.evaluate((el) => el.open)))
      await folder.locator(":scope > summary").click();
  return root;
}
module.exports = { collectionAction, openSection, openTree };
