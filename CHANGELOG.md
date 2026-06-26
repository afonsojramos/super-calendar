# Changelog

## [1.0.0](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.6.0...v1.0.0) (2026-06-25)


### Features

* add picker subpath entry point ([0c5ba9b](https://github.com/afonsojramos/react-native-super-calendar/commit/0c5ba9b333f1968e05c8ebcc2466cc51eca4ad81))
* add Reanimated-free DefaultMonthEvent renderer ([6881720](https://github.com/afonsojramos/react-native-super-calendar/commit/6881720e6de6a7c8c4b980f3594ed57e6584c92c))
* distinguish all-day events in the schedule view with a configurable allDayLabel ([30a3d17](https://github.com/afonsojramos/react-native-super-calendar/commit/30a3d176027a6b3aca0c1eeec39c3f1518e462c1))


### Miscellaneous Chores

* release 1.0.0 ([f0b9047](https://github.com/afonsojramos/react-native-super-calendar/commit/f0b9047abc3b788e0afecaffe8d648d28d161d69))

## [0.6.0](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.5.0...v0.6.0) (2026-06-25)


### Features

* add date-range selection state and useDateRange hook ([384fbd5](https://github.com/afonsojramos/react-native-super-calendar/commit/384fbd568c8c5bfeae5f987a1b91256928ee5c63))
* add headless useMonthGrid hook and buildMonthGrid builder ([e1c868a](https://github.com/afonsojramos/react-native-super-calendar/commit/e1c868a1c5ac5c2b241245d53f64adc782edc22b))
* add selection and range theme tokens ([ae77454](https://github.com/afonsojramos/react-native-super-calendar/commit/ae774543953cbe932753e2c833ac5ce7a5caf22c))
* add vertically-scrolling MonthList component ([23ed5c7](https://github.com/afonsojramos/react-native-super-calendar/commit/23ed5c777df11f87989f63dc9ca0030aef6ecb20))
* default MonthList event props so it works as a standalone picker ([4a8f78d](https://github.com/afonsojramos/react-native-super-calendar/commit/4a8f78d1159c65c7bcbf552dde6d952bb371fbc5))
* demo businessHours (9-5 weekdays, closed weekends) in the example ([377abe3](https://github.com/afonsojramos/react-native-super-calendar/commit/377abe30b06cd6dc4885ff7fd1da07ba96d2e54d))
* demo date-range selection in the example app ([5babc4d](https://github.com/afonsojramos/react-native-super-calendar/commit/5babc4ddb9101630e0202a95fa6c63ff267daa13))
* demo drop rejection by locking exam events in the example ([4978d2d](https://github.com/afonsojramos/react-native-super-calendar/commit/4978d2d236ad12b8c2f956e9367a137ebb61b300))
* disable days outside min/max or isDateDisabled in month view ([62db94a](https://github.com/afonsojramos/react-native-super-calendar/commit/62db94a4e2fdf25da7b7895997a1d191d48d12d1))
* **docs:** brand docs with the calendar icon, favicon and wordmark logo ([1bfd745](https://github.com/afonsojramos/react-native-super-calendar/commit/1bfd745a5fdc01f601c6e1fbb563d34e4228a86e))
* **example:** demo MonthList and disabled picker dates ([746d291](https://github.com/afonsojramos/react-native-super-calendar/commit/746d29195c945ebc6eff1122ef3e96a9c70c736d))
* **example:** set the app icon, splash and web favicon ([c735841](https://github.com/afonsojramos/react-native-super-calendar/commit/c7358415dedbc49cc58aa64983e10490623468f1))
* export date-selection API from the package entry ([4dedd63](https://github.com/afonsojramos/react-native-super-calendar/commit/4dedd636512a5e6f20b687e6889ab54195d25aa3))
* let onDragEvent return false to reject a drop and snap back ([b0f65e8](https://github.com/afonsojramos/react-native-super-calendar/commit/b0f65e800e4d3765e66d2a76f160a7cf3cbad580))
* move date selection to MonthList with drag-select and cross-month ranges ([0c6fd79](https://github.com/afonsojramos/react-native-super-calendar/commit/0c6fd794b9541c8ec1a61793b03ad69b24557f08))
* render selected days and range band in month view ([2cdb1a7](https://github.com/afonsojramos/react-native-super-calendar/commit/2cdb1a7b2327e9a33431df7ecf849bcec20f8ee7))
* shade non-working hours via a businessHours prop ([5f129ec](https://github.com/afonsojramos/react-native-super-calendar/commit/5f129ec2e5c96fb6712c0a05ee6bdded0f8af92b))
* thread date selection through Calendar and MonthPager ([3706341](https://github.com/afonsojramos/react-native-super-calendar/commit/3706341a5c2d2472684e1242726ffa1f3fb26f16))


### Bug Fixes

* correct RTL drag mapping, cache month weeks per frame, export buildMonthGrid, dedupe selectable guard ([13dc301](https://github.com/afonsojramos/react-native-super-calendar/commit/13dc301cd11f69004a222eb253c79817ad770d0b))
* keep the example mode tabs on one scrollable row ([2794b53](https://github.com/afonsojramos/react-native-super-calendar/commit/2794b53e881f3eac46d7c399abcd7937eae60a59))
* pin MonthList header height so the drag hit-test matches the layout ([628c3cb](https://github.com/afonsojramos/react-native-super-calendar/commit/628c3cb8bd3e4bc85fc087799e9c06d8aac1654f))
* repaint month selection via context so cached pages update ([fcc1a50](https://github.com/afonsojramos/react-native-super-calendar/commit/fcc1a50bf77815f70c40196690d16eca247a5128))
* show only the current month's days in MonthList ([3d01650](https://github.com/afonsojramos/react-native-super-calendar/commit/3d01650d9c8f3e3c5bd289f656e9694450a14927))

## [0.5.0](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.4.0...v0.5.0) (2026-06-24)


### Features

* add drag-to-create on the week/day grid ([989477e](https://github.com/afonsojramos/react-native-super-calendar/commit/989477e8702922fe1218679c119060f188b55f54))
* demo drag-to-create in the example ([0d1422c](https://github.com/afonsojramos/react-native-super-calendar/commit/0d1422cf770ae82ddcb68571b4fa0a9110c3c490))
* drag events horizontally to move them across days ([c11acde](https://github.com/afonsojramos/react-native-super-calendar/commit/c11acde8f8ebc23e0ea8d69034b49ed6d7983d77))
* enable drag-to-create on web via a click-drag threshold ([b3e0b3e](https://github.com/afonsojramos/react-native-super-calendar/commit/b3e0b3e614d842338c9c6004f9126ec2e8771213))
* enable drag-to-move and resize on web via a click-drag threshold ([6e193aa](https://github.com/afonsojramos/react-native-super-calendar/commit/6e193aa03bc35126bad6ddb509f53f41e6cc7cb2))


### Bug Fixes

* declare the css module so the example typechecks on web ([e412736](https://github.com/afonsojramos/react-native-super-calendar/commit/e4127366cd5c1a8f693613cf02ecec05a4e29f91))
* fire onPressCell on web taps and let Escape cancel an event sweep ([8df2eba](https://github.com/afonsojramos/react-native-super-calendar/commit/8df2eba57c20f2c0401b8bf689fafff85049baf1))

## [0.4.0](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.3.0...v0.4.0) (2026-06-24)


### Features

* add a built-in darkTheme preset ([818b45e](https://github.com/afonsojramos/react-native-super-calendar/commit/818b45e8dc0b4436c9cd45dd423867f09d7522fe))
* add expandRecurringEvents for recurring events ([61dd45e](https://github.com/afonsojramos/react-native-super-calendar/commit/61dd45edb0a1e7a5d2395850d63cb9d9fb28178f))
* add timezone-aware display helpers ([af28464](https://github.com/afonsojramos/react-native-super-calendar/commit/af28464682a19b4dac65680bb489fd71265decf7))
* demo a web right-click context menu and event drag in the example ([c545b4a](https://github.com/afonsojramos/react-native-super-calendar/commit/c545b4a340e637a5df252ef46a629064d4fe1c53))
* drag to move and resize events on the week/day grid ([4cd2eaf](https://github.com/afonsojramos/react-native-super-calendar/commit/4cd2eaf7698bcec659d1e9bdd4a3a083896c3b4d))
* enrich event accessibility labels with time and state ([bf921e5](https://github.com/afonsojramos/react-native-super-calendar/commit/bf921e5c73fe34706007cbc91f6ad6965f5663b4))
* fire onDragStart when an event drag begins ([421c922](https://github.com/afonsojramos/react-native-super-calendar/commit/421c92231d8fc8539d3f80f410914820d7dea21a))
* page the calendar with arrow keys on web, disabling swipe there ([04bbc3a](https://github.com/afonsojramos/react-native-super-calendar/commit/04bbc3a12f5ced2f3f92a4f49d5959d934a8121e))
* zoom the web grid with ctrl/cmd + scroll ([dae87f8](https://github.com/afonsojramos/react-native-super-calendar/commit/dae87f8be0260967a4bcd5e84434330a848e9868))


### Bug Fixes

* hold the drag offset until the committed move re-renders ([65abb86](https://github.com/afonsojramos/react-native-super-calendar/commit/65abb862d17b17d313bed28950c9a3a15b6687d0))
* render month day cells as cells, not nested buttons, on web ([f5fc80a](https://github.com/afonsojramos/react-native-super-calendar/commit/f5fc80aa11ff97adad374e65b4137d1af81faa8f))
* repaint the week/day grid when events change ([308f4ea](https://github.com/afonsojramos/react-native-super-calendar/commit/308f4ea091425b3d8d42923460333371106d043c))
* silence web console warnings from pointerEvents and leaked scroll props ([7d7fb39](https://github.com/afonsojramos/react-native-super-calendar/commit/7d7fb399bab641d5e47730ce8255c2c71efa1655))

## [0.3.0](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.2.2...v0.3.0) (2026-06-23)


### Features

* auto-fit month event chips to the cell height ([a455d71](https://github.com/afonsojramos/react-native-super-calendar/commit/a455d71930726e9b59448862e9182a75a6f92cba))
* improve built-in event rendering (month titles, clip/wrap, fitted times) ([f2dcefd](https://github.com/afonsojramos/react-native-super-calendar/commit/f2dcefdfe166d41ea011f3dbe93c615c9449addf))
* inset time-grid event boxes for a small gap between them ([4b40bba](https://github.com/afonsojramos/react-native-super-calendar/commit/4b40bba1d94878d27cbf903f4902e94fa55d27da))


### Bug Fixes

* confine the week/day current-time line to today's column ([e122754](https://github.com/afonsojramos/react-native-super-calendar/commit/e12275490d2ef090a298d80b8f310b0abc40a9ab))
* scope type-aware lint to src so CI does not resolve example tsconfig ([7328dee](https://github.com/afonsojramos/react-native-super-calendar/commit/7328dee71da08defba274788fedb66306b5b70b1))

## [0.2.2](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.2.1...v0.2.2) (2026-06-22)


### Build System

* **example:** track the pnpm lockfile ([6abdee1](https://github.com/afonsojramos/react-native-super-calendar/commit/6abdee198bd6b19ce58390ab7f1caff1c05a902e))

## [0.2.1](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.2.0...v0.2.1) (2026-06-22)


### Bug Fixes

* **example:** block the library's node_modules to dedupe React Native in Metro ([f4ceaff](https://github.com/afonsojramos/react-native-super-calendar/commit/f4ceaff5acf62d279ed9b3d3e624e6190b4b92ac))
* **example:** use SafeAreaView from react-native-safe-area-context ([1e7b4e4](https://github.com/afonsojramos/react-native-super-calendar/commit/1e7b4e45f86e80a1c726364e9c31d1f6b62c1535))
* **timegrid:** key multi-day event segments per day to avoid duplicate keys ([c1a1350](https://github.com/afonsojramos/react-native-super-calendar/commit/c1a1350f446ec971e405841649cf229c3387a6f6))
* **timegrid:** reserve the today-badge size to avoid header layout shift ([d784047](https://github.com/afonsojramos/react-native-super-calendar/commit/d784047f06148cf90836c57d9658973cc9c968ef))

## [0.2.0](https://github.com/afonsojramos/react-native-super-calendar/compare/v0.1.0...v0.2.0) (2026-06-22)


### Features

* add 3days and custom N-day time-grid views ([353a9f8](https://github.com/afonsojramos/react-native-super-calendar/commit/353a9f8eb0c7ff5e79473db01997bace3dd8687f))
* add activeDate to highlight a chosen date over today ([78e0a69](https://github.com/afonsojramos/react-native-super-calendar/commit/78e0a6975e50b6d8e03c341daa99a67bae3fce20))
* add all-day events with a lane above the time grid ([fa25f55](https://github.com/afonsojramos/react-native-super-calendar/commit/fa25f5569ce7b081b3eafb35486cf8627775c472))
* add calendarCellStyle for per-date cell/column styling ([35a81fc](https://github.com/afonsojramos/react-native-super-calendar/commit/35a81fc59bc0bae2a0d274f425d6a34b27578546))
* add eventCellStyle for per-event styling of the default renderer ([d7083c2](https://github.com/afonsojramos/react-native-super-calendar/commit/d7083c20b5fb87e1b6d306daaacb1b44de3857cb))
* add hideHours, showWeekNumber and headerComponent slot ([5a16af9](https://github.com/afonsojramos/react-native-super-calendar/commit/5a16af975ad953e765413fe0db0793502da7fbeb))
* add hourComponent slot to customize the hour-axis label ([50bffcf](https://github.com/afonsojramos/react-native-super-calendar/commit/50bffcf6595752814db59166133f5d6535e322ea))
* add isRTL prop for right-to-left day-column order ([f19f28b](https://github.com/afonsojramos/react-native-super-calendar/commit/f19f28b06d99f6c0112b1bb5b8f73b78722567a2))
* add itemSeparatorComponent for the schedule list ([46edf06](https://github.com/afonsojramos/react-native-super-calendar/commit/46edf061a029a386fde704d53cc23b0c10423cae))
* add onChangeDateRange to emit the visible date span ([c93806d](https://github.com/afonsojramos/react-native-super-calendar/commit/c93806db15497db46c692c056f4e430ee828d77f))
* add onLongPressEvent, onLongPressCell and onLongPressDay handlers ([c23c963](https://github.com/afonsojramos/react-native-super-calendar/commit/c23c9638f7f0f384f3c2248013fadd97438902fd))
* add onPressDateHeader and align multi-day headers with the grid ([98658dd](https://github.com/afonsojramos/react-native-super-calendar/commit/98658dd86fd37dec56375b6c0dc0fa035c816607))
* add resetPageOnPressCell to recenter the grid after a cell press ([3f64c2d](https://github.com/afonsojramos/react-native-super-calendar/commit/3f64c2d4493dd73ae6abc195fc19921d26b617ad))
* add schedule (agenda) mode ([de17f13](https://github.com/afonsojramos/react-native-super-calendar/commit/de17f130c4651b474b345a597c74fd8d51d9f0d6))
* add sortedMonthView, moreLabel, showAdjacentMonths, disableMonthEventCellPress ([4264168](https://github.com/afonsojramos/react-native-super-calendar/commit/426416859f492190ff58dae7e643663e6ade4ed8))
* add swipeEnabled, showSixWeeks, weekNumberPrefix, showVerticalScrollIndicator ([4e1198e](https://github.com/afonsojramos/react-native-super-calendar/commit/4e1198e041e4061a1082e65fdb65326c617ef642))
* add timeslots sub-hour divider lines ([ec64fd5](https://github.com/afonsojramos/react-native-super-calendar/commit/ec64fd52b1c85201403484fe1df70cb02b0920e2))
* add verticalScrollEnabled to lock the time-grid scroll ([98e43fb](https://github.com/afonsojramos/react-native-super-calendar/commit/98e43fb159980b845c16edc5d1a42edc925ccb83))
* add weekEndsOn for week-anchored custom partial-week views ([5e53d43](https://github.com/afonsojramos/react-native-super-calendar/commit/5e53d433489e04e2657321b8f292ad85a1276c8c))
* honor ampm and showTime in the built-in event renderer ([f800d23](https://github.com/afonsojramos/react-native-super-calendar/commit/f800d23a4939230f8a67d192193bca8afba30271))
* honor per-event disabled (skip presses, dim default renderer) ([be8010a](https://github.com/afonsojramos/react-native-super-calendar/commit/be8010a1212c11ac9053d7dc5bf95b70de8b6bf0))
* localize weekday and date labels via a date-fns Locale ([1332447](https://github.com/afonsojramos/react-native-super-calendar/commit/1332447e6f6effcf84857216695c367deb4d6561))
* render a default month weekday header with renderHeaderForMonthView slot ([074814a](https://github.com/afonsojramos/react-native-super-calendar/commit/074814a16501d6a3d7910be6f54ff2ac2c886b6c))


### Bug Fixes

* remount the time-grid on day/week/custom switch to stop the mode-switch flash ([06521d4](https://github.com/afonsojramos/react-native-super-calendar/commit/06521d496ac4f9686b1d76e12eceb00e63b50702))
* stop the day/week-switch blank flash by remounting the grid only on first measure ([3f29457](https://github.com/afonsojramos/react-native-super-calendar/commit/3f29457bfc25db700ef6cb4ec2be26070433da9c))


### Reverts

* drop the mode-switch remount key (wrong root cause) ([f0d561f](https://github.com/afonsojramos/react-native-super-calendar/commit/f0d561f2002d132b828f9d95e3c0f9d9af4e1f30))
