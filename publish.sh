#!/bin/bash
# VSCode Extension Publisher

echo "=== Code Claw VSCode Extension Publisher ==="
echo ""
echo "请按照以下步骤操作："
echo ""
echo "1. 访问: https://dev.azure.com"
echo "2. 使用账户 17662065882@163.com 登录"
echo "3. 进入: User Settings → Personal Access Tokens → New Token"
echo "4. 配置:"
echo "   - Organization: All accessible organizations"
echo "   - Expiration: 选择有效期（建议 90 天）"
echo "   - Scopes: Marketplace → Manage"
echo "5. 创建 Token 并复制"
echo ""
read -p "粘贴你的 PAT Token: " TOKEN

if [ -z "$TOKEN" ]; then
    echo "错误: Token 不能为空"
    exit 1
fi

echo ""
echo "正在发布..."
npx @vscode/vsce publish -p "$TOKEN"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 发布成功！"
    echo "扩展将在几分钟内出现在 Marketplace: https://marketplace.visualstudio.com/items?itemName=Sansec.codeclaw-vscode"
else
    echo ""
    echo "❌ 发布失败，请检查错误信息"
fi
