# Deploying the live demo

The live demo runs for free on **Render** (the store and the TestPay sandbox) with a **Neon** Postgres database. Neither one needs a credit card or business verification. It takes about 20 minutes.

| Part | Where it runs | Free limits |
|---|---|---|
| Store (`app/`) | Render web service `securecart-arya` | Sleeps after 15 minutes without visitors; the next visit takes about a minute to wake it |
| TestPay sandbox (`testpay/`) | Render web service `securecart-arya-testpay` | Same; the store wakes it automatically when someone visits |
| Database | Neon Postgres | 1 GB storage, 100 compute-hours a month, never expires |

The deployed site runs in **public demo mode** (`PUBLIC_DEMO=true`). It is open to the internet, so:
- The demo mailbox is turned off. It would show anyone the password-reset link for any account.
- No shared demo accounts are created. Visitors register their own, so nobody can change a password that someone else is using.
- The staff accounts use a password only you know (`SEED_ADMIN_PASSWORD`).
- Stock is refilled every time the service starts, so test purchases never empty the shop.

---

## 1. Put the code on GitHub

Create an empty repository at https://github.com/new named `securecart` (Public, with no README, .gitignore or licence). Then, on your Mac:

```bash
cd ~/Downloads/securecart
git init
git add .
git commit -m "SecureCart: security-hardened e-commerce demo"
git branch -M main
git remote add origin https://github.com/aryachauragade02/securecart.git
git push -u origin main
```

`.env` is in `.gitignore`, so your local secrets are not uploaded.

## 2. Create the database (Neon)

1. Sign up at https://neon.com with your GitHub account.
2. Create a project named `securecart`. For the region, choose **AWS Asia Pacific (Singapore)**, which is close to Render's Singapore region.
3. On the project dashboard click **Connect**, switch **Connection pooling off**, and copy the connection string. It looks like:
   `postgresql://neondb_owner:...@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

## 3. Make an encryption key

On your Mac:

```bash
openssl rand -base64 32
```

Copy the output. This key encrypts two-step verification secrets, so keep it private. If you change it later, existing two-step setups stop working.

## 4. Deploy on Render

1. Sign up at https://render.com with your GitHub account and allow it to access the `securecart` repository.
2. Click **New → Blueprint**, pick the `securecart` repository and click **Connect**. Render reads `render.yaml` and shows the two services.
3. Fill in the five values it asks for:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string from step 2 |
| `DATA_ENCRYPTION_KEY` | the key from step 3 |
| `SEED_ADMIN_PASSWORD` | a strong password of your own for `admin@securecart.test` |
| `TESTPAY_API_URL` | `https://securecart-arya-testpay.onrender.com` |
| `STORE_ORIGIN` | `https://securecart-arya.onrender.com` |

4. Click **Apply** (or **Deploy Blueprint**). The first build takes about 5 to 10 minutes.

**Check the two URLs.** Open each service in the Render dashboard; its address is shown at the top. If Render gave a service a different address (for example `securecart-arya-x1y2.onrender.com`, because the name was already taken), update the matching value on the other service under **Environment**, then click **Save, rebuild and deploy**:
- the store's `TESTPAY_API_URL` must be the TestPay service's address
- the TestPay service's `STORE_ORIGIN` must be the store's address

## 5. Test the live site

1. Open `https://securecart-arya.onrender.com`. The first load can take about a minute while the free service wakes.
2. Register an account, add something to the cart and check out.
3. Pay with `4242 4242 4242 4242`, any future expiry and any CVC. The order should show **Paid**.
4. Sign in as `admin@securecart.test` with your `SEED_ADMIN_PASSWORD`, then go straight to **Account → Security** and set up two-step verification. Staff pages need it.

If something fails, open the service in Render and look at **Logs**.

## 6. Add the link to GitHub

1. In this repository's README, the **Live demo** line at the top already points to `https://securecart-arya.onrender.com`. If your address is different, edit that line.
2. On the repository page, click the gear icon next to **About**, paste the link into **Website**, and save. The link then appears at the top right of the repository.

## Notes

- Don't point an uptime monitor at the site to keep it awake. Render's 750 free hours a month are shared by both services, and keeping both running all the time would use them up mid-month.
- Want the Razorpay checkout on the live site? Add `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (test keys) to the store's environment.
- PulseOps monitoring and the attack simulator are local-only. The simulator refuses to run against anything but localhost, so run them on your own machine (see README).
