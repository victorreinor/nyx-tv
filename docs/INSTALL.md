# 📲 Install Nyx on your Samsung TV

<sub>English · [Português](INSTALAR.md)</sub>

Nyx is not in the Samsung store. You install it **once** with **[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung)**,
a free community app that sends Nyx to the TV over Wi‑Fi. It runs on your phone (Android) or computer
(Windows, macOS, Linux). No Tizen Studio. After that, Nyx opens on the TV like any other app, without the phone.

**You need:**

- A Samsung TV from **2021 or newer** (Tizen 6.0+).
- The phone or computer on the **same Wi‑Fi** as the TV (not a guest network).
- On TVs from 2023 on (Tizen 7+), a free **Samsung account**.

## 1. Get Apps2Samsung

- **Android:** download the file ending in `-android.apk` from the [latest release](https://github.com/Apps2Samsung/Apps2Samsung/releases/latest) and install it.
  If you use Obtainium or F‑Droid, you can add it there and it updates by itself (see [their README](https://github.com/Apps2Samsung/Apps2Samsung#-get-the-android-app-auto-updating)).
- **Computer:** download the version for your system from the [same page](https://github.com/Apps2Samsung/Apps2Samsung/releases/latest).

Open the app and note the phone's or computer's **IP**. It shows in the settings as *Local IP* and looks like `192.168.0.20`.

## 2. Turn on Developer Mode on the TV

1. Press **Home** on the remote and open **Apps**.
2. Type `1` `2` `3` `4` `5` on the remote. No number buttons? Press **123** and type it on the screen.
3. Turn **Developer mode** on and enter the IP from step 1 in **Host PC IP**.
4. Restart the TV.

Developer Mode only accepts installs from that IP.

## 3. Install Nyx

1. In Apps2Samsung, pick your TV. It searches the Wi‑Fi by itself; if it doesn't find it, type the TV's IP.
2. Find **Nyx** in the catalog, under **IPTV & Live TV**, and tap **Install**.
   If Nyx is not in the catalog yet, download [`nyx.wgt`](https://github.com/victorreinor/nyx-tv/releases/latest/download/nyx.wgt)
   and pick it as a **custom `.wgt`**.
3. If it asks, sign in to your Samsung account. First time only: Samsung issues the certificate that makes the TV accept the app.

Done: Nyx opens on the TV. Add your playlist (Xtream Codes or M3U) and start watching.

## Updating

Nyx updates itself over the internet: it downloads the new version in the background and uses it the next time it opens.
*Settings › About* shows the version, the update status and a **Check now** button.
If a new version fails to open, Nyx goes back to the previous one on its own.

You only need the installer in two cases: your Nyx is version 1.3 or older (before self-updating existed),
or *Settings › About* says the new version must be installed from your phone or computer (this happens when something in the package changes, such as permissions).

Apps2Samsung lists the apps installed on the TV and shows when a new Nyx version is out. Update from there.
If you installed from a custom `.wgt`, download `nyx.wgt` again from the same link and install it the same way.

Your playlists, favorites and progress stay, **as long as you update with the same installer you used the first time**.
Each installer signs Nyx with a different key, and the TV refuses the switch.

## Troubleshooting

| Problem | Fix |
|---|---|
| Apps2Samsung doesn't find the TV | Check that both are on the same Wi‑Fi, Developer Mode is on with the right IP, and the TV was restarted. Still nothing? Unplug the TV for 15 seconds and plug it back in. |
| The IP shows reversed on the TV (`20.0.168.192`) | The TV is set to a right‑to‑left language. Type the IP backwards. |
| *Author certificate not match* | Nyx was already installed by another installer or computer. Uninstall it on the TV (hold **OK** on the Nyx icon → **Delete**) and install again. This erases saved playlists. |

## Another option: TV Installer (Android)

[TV Installer](https://github.com/sunic007/tvinstaller) does the same, Android 7+ only. Turn on Developer Mode with the phone's IP,
add your own `.wgt` by link and paste:

```
https://github.com/victorreinor/nyx-tv/releases/latest/download/nyx.wgt
```

---

<sub>Apps2Samsung and TV Installer are independent community projects, not made by Nyx or Samsung.
Nyx is a player: it does not provide, host or sell any content.</sub>
