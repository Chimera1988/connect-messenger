const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const liquid = fs.readFileSync(path.join(root,'app/liquid-glass.css'),'utf8');
const marker = 'CONNECT_PWA_CHAT_COMPACT_OFFLINE_V1_20261115';

test('offline chat avatar has an explicit PWA-only size matching Contacts',()=>{
  assert.match(liquid,new RegExp(`/\\* ${marker} `));
  assert.match(liquid,/\.connect-app\[data-connect-pwa-list-parity="true"\] \.chat-rows \.dialog-row > \.person-avatar\.avatar-md\s*\{[^}]*width:\s*46px;[^}]*min-width:\s*46px;[^}]*height:\s*46px;/s);
});

test('real Chromium: Contacts and Chats offline and online avatar and card sizes match',async()=>{
  const {chromium} = require('playwright-core');
  const browser = await chromium.launch({executablePath:process.env.CONNECT_TEST_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
  try {
    for (const width of [320,375,390,430]) for (const mode of ['dark','light']) {
      const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
      await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><div class="connect-app ${mode==='light'?'light':''}" data-connect-pwa-list-parity="true"><div class="main-view">
      <div class="contact-rows"><button class="contact-row"><span class="person-avatar avatar-md">А</span><span class="contact-text"><strong>Тестировщик )</strong><small>Тестовый аккаунт</small></span></button></div>
      <div class="chat-rows">
        <div class="dialog-entry"><button class="dialog-row"><span class="person-avatar avatar-md">А</span><div class="dialog-summary"><strong>Тестировщик )</strong><span>Вы: Стикер</span></div><div class="dialog-meta"><time>Вчера</time></div></button></div>
        <div class="dialog-entry"><button class="dialog-row"><span class="connect-presence-avatar"><span class="person-avatar avatar-md">Б</span><span class="connect-presence-dot"></span></span><div class="dialog-summary"><strong>Онлайн</strong><span>Привет</span></div><div class="dialog-meta"><time>21:45</time></div></button></div>
      </div></div></div>`);
      for (const filename of ['globals.css','liquid-glass.css']) await page.addStyleTag({content:fs.readFileSync(path.join(root,'app',filename),'utf8')});
      const dimensions = await page.evaluate(()=>{
        const get=sel=>document.querySelector(sel).getBoundingClientRect();
        return {
          contactAvatar:get('.contact-row > .person-avatar').width,
          offlineAvatar:get('.dialog-entry:first-child .dialog-row > .person-avatar').width,
          onlineAvatar:get('.dialog-entry:nth-child(2) .connect-presence-avatar').width,
          contactHeight:get('.contact-row').height,
          offlineHeight:get('.dialog-entry:first-child .dialog-row').height,
          onlineHeight:get('.dialog-entry:nth-child(2) .dialog-row').height,
        };
      });
      assert.equal(dimensions.contactAvatar,46,`Contact baseline ${width}px ${mode}`);
      assert.equal(dimensions.offlineAvatar,dimensions.contactAvatar,`offline avatar ${width}px ${mode}: ${JSON.stringify(dimensions)}`);
      assert.equal(dimensions.onlineAvatar,dimensions.contactAvatar,`online avatar ${width}px ${mode}`);
      assert.ok(Math.abs(dimensions.offlineHeight-dimensions.contactHeight)<=2,`offline card height ${width}px ${mode}: ${JSON.stringify(dimensions)}`);
      assert.ok(Math.abs(dimensions.onlineHeight-dimensions.contactHeight)<=2,`online card height ${width}px ${mode}: ${JSON.stringify(dimensions)}`);
      await page.close();
    }
  } finally {await browser.close();}
});
