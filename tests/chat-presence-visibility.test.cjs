const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.join(__dirname, '..');
const main = require('./helpers/app-source.cjs')();
const globalCss = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const liquidCss = fs.readFileSync(path.join(root, 'app/liquid-glass.css'), 'utf8');

test('Chats: online dot is not clipped and inherits the selected accent', async () => {
  assert.match(main, /filteredChats\.map\(c =>/);
  assert.match(main, /<PresenceAvatar name=\{c\.other\?\.display_name[^\n]*online=\{!isNativeMediaRuntime\(\) && formatPresence\(presence\[c\.other\?\.id \|\| ''\], clock\) === 'В сети'\}/);
  assert.match(main, /filteredContacts\.map\(p =>[^\n]*<PresenceAvatar/);
  assert.match(globalCss, /\.connect-app \.connect-presence-dot\s*\{/);

  const browser = await chromium.launch({args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent(`<!doctype html><html lang="ru"><head><style>${globalCss}\n${liquidCss}</style></head>
    <body><div class="connect-app" style="--accent:#cc4545"><div class="main-view">
      <div class="chat-rows"><div class="dialog-entry"><button type="button" class="dialog-row">
        <span class="connect-presence-avatar"><span class="person-avatar avatar-md">Т</span><span class="connect-presence-dot" aria-label="В сети"></span></span>
        <span class="dialog-summary">Тестировщик</span><span class="dialog-meta">18:48</span>
      </button></div></div>
      <div class="contact-rows"><button type="button" class="contact-row">
        <span class="connect-presence-avatar"><span class="person-avatar avatar-md">Т</span><span class="connect-presence-dot" aria-label="В сети"></span></span><span class="contact-text">Тестировщик</span>
      </button></div>
    </div></div></body></html>`,{waitUntil:'load'});

    async function state() {return page.evaluate(() => {
      const chat = document.querySelector('.chat-rows .connect-presence-avatar');
      const avatar = chat.querySelector('.person-avatar');
      const chatDot = chat.querySelector('.connect-presence-dot');
      const contactDot = document.querySelector('.contact-rows .connect-presence-dot');
      return {
        overflow: getComputedStyle(chat).overflow,
        radius: getComputedStyle(chat).borderRadius,
        chatWidth: chat.getBoundingClientRect().width,
        avatarWidth: avatar.getBoundingClientRect().width,
        avatarHeight: avatar.getBoundingClientRect().height,
        chatHeight: chat.getBoundingClientRect().height,
        dotColor: getComputedStyle(chatDot).backgroundColor,
        contactColor: getComputedStyle(contactDot).backgroundColor,
        dotPosition: getComputedStyle(chatDot).position,
      };
    });}
    for (const width of [390,360]) {
      await page.setViewportSize({width,height:844});
      const result=await state();
      assert.equal(result.overflow, 'visible', 'online chat avatar wrapper must not clip the presence dot');
      assert.equal(result.radius, '0px', 'only the inner avatar should be circular');
      assert.ok(Math.abs(result.chatWidth-result.avatarWidth)<.5, 'chat avatar image must fill the original avatar slot');
      assert.ok(Math.abs(result.chatHeight-result.avatarHeight)<.5, 'chat avatar height must fill the original slot');
      assert.equal(result.dotPosition, 'absolute');
      assert.equal(result.dotColor, 'rgb(204, 69, 69)', 'online badge must follow the selected accent');
      assert.equal(result.contactColor, result.dotColor, 'Contacts badge must keep the same theme color');
    }
    await page.close();
  } finally {await browser.close();}
});
