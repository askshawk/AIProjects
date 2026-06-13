# Deploy SimRefinery to the Web

Follow these steps to get your refinery simulation live online, just like Ethan's version at simrefinery.netlify.app

## 🚀 Quickest Method: Netlify via GitHub (5 minutes)

### Step 1: Connect GitHub to Netlify
1. Visit [netlify.com](https://netlify.com)
2. Click "Sign up" (or sign in if you have an account)
3. Choose "Sign up with GitHub"
4. Authorize Netlify to access your GitHub account

### Step 2: Deploy the Repository
1. Click "New site from Git"
2. Select "GitHub" as your Git provider
3. Search for and select `askshawk/AIProjects`
4. Configure build settings:
   - **Branch to deploy**: `claude/simrefinery-opus-replication-mjnvm8` (or `main`)
   - **Build command**: Leave empty (no build required)
   - **Publish directory**: `simrefinery`
5. Click "Deploy site"

### Step 3: Wait for Deployment
- Netlify will automatically build and deploy your site
- You'll get a URL like `https://random-name-12345.netlify.app`
- Your game is now live!

### Step 4: Customize Your Domain (Optional)
1. In Netlify dashboard, go to "Site settings"
2. Click "Change site name"
3. Enter your preferred name (e.g., `my-simrefinery`)
4. Your new URL: `https://my-simrefinery.netlify.app`

Or add a custom domain like `simrefinery.yourdomain.com`

---

## 🎯 Alternative: Drag & Drop Deploy (3 minutes)

No GitHub needed!

1. Zip the contents of the `simrefinery` folder:
   - index.html
   - styles.css
   - game.js
   - netlify.toml
   - _redirects

2. Go to [netlify.com/drop](https://app.netlify.com/drop)

3. Drag your zip file onto the page

4. Your site is instantly live with a random URL!

---

## 💻 Advanced: Netlify CLI (For Developers)

### Install Netlify CLI
```bash
npm install -g netlify-cli
```

### Deploy
```bash
cd /path/to/simrefinery
netlify deploy --prod
```

### Connect to account
If prompted, log in with your GitHub account.

Your site will be deployed with a Netlify URL!

---

## ✨ What Gets Deployed

These files from the `simrefinery` folder:
- `index.html` - The game interface
- `styles.css` - All styling
- `game.js` - Game engine and logic
- `netlify.toml` - Netlify configuration
- `_redirects` - URL routing rules
- `package.json` - Project metadata

## 🔧 Important Files

**netlify.toml**: Tells Netlify how to serve your site
- No build command needed (it's static HTML/CSS/JS)
- Redirects all routes to index.html
- Already configured - no changes needed

**_redirects**: Backup routing file for single-page app behavior

## 🌐 After Deployment

### Share Your Game
- Copy the Netlify URL
- Share with friends, family, colleagues
- Works on desktop, tablet, and mobile

### Monitor Performance
- Netlify dashboard shows analytics
- See how many people are playing
- Check for any errors

### Update Your Game
Push new changes to your branch → Netlify auto-deploys!

```bash
# After making changes locally:
git add .
git commit -m "Game improvement"
git push origin claude/simrefinery-opus-replication-mjnvm8
# Netlify redeploys automatically!
```

---

## 🆘 Troubleshooting

### Site shows blank page
- Check that "Publish directory" is set to `simrefinery`
- Verify all files were uploaded
- Try clearing browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)

### Game controls don't work
- Make sure game.js loaded (check browser console for errors)
- Verify all three files are deployed: index.html, styles.css, game.js

### Can't access site
- Wait a few minutes for deployment to complete
- Check your Netlify dashboard for build logs
- Verify the URL in your browser matches the Netlify URL

---

## 📊 Example Deployment

**Before**: Game only runs locally with `python3 -m http.server`

**After**: Game is live at `https://myrefinery.netlify.app` - shareable URL, no local server needed!

---

## 🎮 You're Ready!

Your SimRefinery simulation is now live on the internet. People can visit your URL anytime to play without any setup.

Happy deploying! ⚙️🏭
