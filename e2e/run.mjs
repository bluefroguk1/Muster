import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const S='/tmp/claude-0/-home-claude/60638a77-e8d8-55b4-9d0a-d17750e3c25c/scratchpad';
const files=fs.readdirSync('test/fixtures/bb').map(f=>'test/fixtures/bb/'+f);
const browser = await chromium.launch({executablePath: process.env.CHROME || '/opt/pw-browsers/chromium'});
const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await page.goto('http://localhost:4173/');
await page.screenshot({path:S+'/s1-home.png'});
// bundled pack + art: no imports needed
await page.waitForTimeout(1500);
await page.screenshot({path:S+'/s1-home.png'});
await page.getByRole('link',{name:/Burrows/}).first().click();
await page.waitForURL(/#\/game\//,{timeout:20000});
await page.waitForTimeout(800);
await page.screenshot({path:S+'/s2-game.png'});
await page.getByRole('button',{name:/Freebeasts/}).click();
await page.fill('#rn','The Thornwood Irregulars');
await page.getByRole('button',{name:'Create band'}).click();
await page.waitForURL(/#\/roster\//);
await page.waitForTimeout(500);
await page.screenshot({path:S+'/s3-empty.png'});
for (const n of ['Add Hedgehog','Add Fox','Add Badger']) { await page.getByLabel(n,{exact:true}).click(); await page.waitForTimeout(200); }
await page.screenshot({path:S+'/s4-band.png'});

// unit detail: make hedgehog a magic user
await page.getByRole('button',{name:/Hedgehog/}).first().click();
await page.waitForTimeout(300);
await page.screenshot({path:S+'/s5a-view.png'});
await page.getByLabel('Character name').first().fill('Bramble Quillsworth');
await page.getByLabel(/^Wound 5/).first().click();
await page.getByRole('button',{name:'Strike · 1'}).first().hover().catch(()=>{});
await page.locator('.shield').nth(1).hover(); await page.waitForTimeout(300);
await page.screenshot({path:S+'/s5b-tip.png'});
await page.getByRole('button',{name:/^Edit$/}).first().click();
await page.waitForTimeout(300);
await page.getByRole('button',{name:'Magic User'}).click();
await page.getByRole('button',{name:'Magical Archetypes'}).click().catch(()=>{});
await page.waitForTimeout(300);
await page.screenshot({path:S+'/s5-magic.png'});
await page.getByRole('button',{name:'Validation'}).click();
await page.waitForTimeout(300);
await page.screenshot({path:S+'/s6-errors.png'});
await page.keyboard.press('Escape');
await page.goto(page.url()+'/cards'); await page.waitForTimeout(800);
await page.screenshot({path:S+'/s7-cards.png',fullPage:true});
await page.goBack(); await page.waitForTimeout(500);
// mobile
await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(300);
await page.screenshot({path:S+'/m1-band.png'});
await page.getByRole('button',{name:/^Recruit$/}).last().click();
await page.waitForTimeout(300);
await page.screenshot({path:S+'/m2-recruit.png'});
await page.getByRole('button',{name:/^Band$/}).click();
await page.getByRole('button',{name:/Fox/}).first().click(); await page.waitForTimeout(300);
await page.screenshot({path:S+'/m3-unit.png'});
// offline reload
await ctx.setOffline(true);
await page.reload(); await page.waitForTimeout(1500);
await page.screenshot({path:S+'/m4-offline.png'});
console.log('offline title', await page.title(), (await page.content()).length);
await page.evaluate(()=>{document.documentElement.classList.add('dark')});
await page.screenshot({path:S+'/m5-dark.png'});
console.log('errors',errs.slice(0,10));
await browser.close();
