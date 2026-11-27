# Component capture helper

Records your **Install Component** list on an Android phone, for upload through **Import from game**. It drives the phone over adb: it selects each stat filter in turn and scrolls each list to the bottom while the phone records its screen. It never taps a fixed position. Every tap target is found on a fresh screenshot, and the run stops if the screen isn't what it expects.

You can do the same by hand with your phone's screen recorder; this saves the tapping.

## Setup (once)

1. Install adb, from [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) or `brew install android-platform-tools` on macOS.
2. On the phone, enable **Developer options** (tap **Build number** seven times in Settings → About phone), then turn on **USB debugging**.
3. Connect the phone by USB, accept the debugging prompt on the phone, and check that `adb devices` lists it as `device`.
4. In this repository, run `npm install`.

## Each capture

1. In the game, uninstall all components, so the list holds every piece. The helper stops if anything appears on the mount board during the run.
2. Open **Install Component** and close any popups.
3. Run `npm run capture` (add `-- --serial <id>` if `adb devices` lists more than one device). Use `npm run capture -- --dry-run` to check that the screen is recognised without tapping anything.
4. Don't touch the phone until it prints `Saved …`. It takes one to two minutes.
5. In the optimizer, open **Inventory → Import from game** and upload the saved video from `tools/capture/out/`.

## Phone refuses taps

Some phones block simulated input by default. If the helper reports that the phone refused taps:

- **Xiaomi / Redmi / POCO (MIUI, HyperOS):** in Developer options, also turn on **USB debugging (Security settings)**. It may ask you to sign in to a Mi account.
- **Other phones:** look for a similar "allow input from USB debugging" option in Developer options.

If your phone has no such option, record by hand instead, following the steps in the app's import dialog.

## What it does

For each filter, in the order the filter menu shows them: open the menu, tap the stat, confirm that the filter icon changed, then drag the list up two rows at a time until it stops moving. Drags run along the gap between the middle columns and pause before lifting, so the list doesn't fling past rows and no component is picked up. Recording uses `adb shell screenrecord`, which stops after three minutes.
