const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: false,  // 显示浏览器窗口
    slowMo: 1000      // 每步操作延迟 1 秒，便于观察
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    console.log('🌐 正在打开 VSCode Marketplace...');
    await page.goto('https://marketplace.visualstudio.com/');

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    console.log('🔍 查找登录按钮...');
    // 尝试多种选择器来找到登录按钮
    const loginButton = await page.locator('a:has-text("Sign in")').first();
    if (await loginButton.isVisible()) {
      await loginButton.click();
    } else {
      // 如果没找到 Sign in，可能已经登录或需要其他选择器
      console.log('⚠️  未找到 "Sign in" 按钮，可能已登录或需要手动操作');
    }

    // 等待用户手动登录
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  请在浏览器中手动完成登录步骤：');
    console.log('   1. 使用账户: 17662065882@163.com');
    console.log('   2. 完成身份验证（可能需要邮箱验证码）');
    console.log('   3. 登录成功后，按回车继续...');
    console.log('='.repeat(60) + '\n');

    // 等待用户按回车
    await page.waitForURL('**/manage/**', { timeout: 0 }).catch(() => {});
    await page.waitForTimeout(5000);

    // 进入发布者管理页面
    console.log('📂 正在进入发布者管理页面...');
    await page.goto('https://marketplace.visualstudio.com/manage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 查找上传扩展按钮
    console.log('🔍 查找上传扩展入口...');

    // 尝试多种方式找到上传按钮
    const uploadSelectors = [
      'a:has-text("Upload extension")',
      'a:has-text("上传扩展")',
      'button:has-text("Upload")',
      'a:has-text("New extension")',
      'a:has-text("新建扩展")'
    ];

    let uploadButton = null;
    for (const selector of uploadSelectors) {
      try {
        uploadButton = page.locator(selector).first();
        if (await uploadButton.isVisible({ timeout: 2000 })) {
          console.log(`✅ 找到上传按钮: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!uploadButton || !(await uploadButton.isVisible())) {
      console.log('\n' + '='.repeat(60));
      console.log('⚠️  未自动找到上传按钮，请手动操作：');
      console.log('   1. 点击 "Upload extension" 或 "上传扩展"');
      console.log('   2. 选择文件: codeclaw-vscode-0.1.79.vsix');
      console.log('   3. 填写扩展信息并发布');
      console.log('   4. 完成后按 Ctrl+C 退出');
      console.log('='.repeat(60) + '\n');

      // 保持浏览器打开，让用户手动操作
      await page.waitForURL('**/**', { timeout: 0 });
    } else {
      await uploadButton.click();
      await page.waitForTimeout(2000);

      // 查找文件上传输入框
      console.log('📤 准备上传 VSIX 文件...');

      const vsixPath = path.resolve(__dirname, 'codeclaw-vscode-0.1.79.vsix');
      console.log(`文件路径: ${vsixPath}`);

      // 尝试找到文件输入框
      const fileInput = await page.locator('input[type="file"]').first();
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles(vsixPath);
        console.log('✅ 文件已选择');

        await page.waitForTimeout(3000);

        // 查找并点击发布按钮
        const publishSelectors = [
          'button:has-text("Publish")',
          'button:has-text("发布")',
          'button[type="submit"]',
          'input[type="submit"]'
        ];

        for (const selector of publishSelectors) {
          try {
            const publishBtn = page.locator(selector).first();
            if (await publishBtn.isVisible({ timeout: 2000 })) {
              console.log(`✅ 找到发布按钮: ${selector}`);
              console.log('⚠️  请确认信息无误后，手动点击发布按钮');
              break;
            }
          } catch (e) {
            continue;
          }
        }
      } else {
        console.log('⚠️  未找到文件上传输入框，请手动选择文件');
      }
    }

    // 保持浏览器打开，等待用户手动完成剩余操作
    console.log('\n' + '='.repeat(60));
    console.log('🔄 浏览器将保持打开状态，请完成剩余操作');
    console.log('   完成后按 Ctrl+C 退出脚本');
    console.log('='.repeat(60) + '\n');

    // 无限期等待，直到用户手动关闭
    await page.waitForURL('**/**', { timeout: 0 });

  } catch (error) {
    console.error('❌ 发生错误:', error.message);
    console.log('\n浏览器将保持打开状态，请手动完成操作...');
    await page.waitForURL('**/**', { timeout: 0 });
  } finally {
    // 注释掉自动关闭，让用户手动操作
    // await browser.close();
  }
})();
