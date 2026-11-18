// Playwright waitForFunction checks Promise truthiness before it resolves. Poll
// async IndexedDB predicates through evaluate and await the actual boolean.
exports.waitForPage = async function waitForPage(page, predicate, arg = null, options = {}) {
 const deadline = Date.now() + (options.timeout || 30000);
 while (!(await page.evaluate(predicate, arg))) {
  if (Date.now() >= deadline) throw Error('Timed out waiting for asynchronous page condition: ' + predicate.toString());
  await new Promise(resolve => setTimeout(resolve, 20));
 }
};
