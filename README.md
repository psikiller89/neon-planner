# Neon Planner

A daily planner and reminder app for Linux in the Neon Odyssey style.

- **Today:** tasks with time, priority, category, notes; quick add; progress bar; notes for the day.
- **Reminders:** desktop notifications at the time or 5 min to 1 day before; repeat once, daily, weekdays, weekly or monthly. The app keeps running in the system tray when you close the window so reminders still fire.
- **Meals:** weekly meal plan (breakfast, lunch, dinner, snack), a recipe library with ingredients, and an automatic shopping list for the week. Today shows the day's meals.
- **Next 7 Days** and a **month calendar**.
- Optional start at login, export/import. Data is saved in `~/.config/Neon Planner/planner.json`.

## Install (Nobara / Fedora / any Linux)

1. Download `Neon-Planner-<version>.AppImage` from the [latest release](https://github.com/psikiller89/neon-planner/releases/latest).
2. `chmod +x Neon-Planner-*.AppImage` (or right-click → Properties → allow executing).
3. Double-click it. If it doesn't start: `sudo dnf install fuse fuse-libs`.
