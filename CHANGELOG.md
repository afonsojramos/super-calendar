# Changelog

## [0.2.1](https://github.com/afonsojramos/react-native-bigger-calendar/compare/v0.2.0...v0.2.1) (2026-06-22)


### Bug Fixes

* **example:** block the library's node_modules to dedupe React Native in Metro ([f4ceaff](https://github.com/afonsojramos/react-native-bigger-calendar/commit/f4ceaff5acf62d279ed9b3d3e624e6190b4b92ac))
* **example:** use SafeAreaView from react-native-safe-area-context ([1e7b4e4](https://github.com/afonsojramos/react-native-bigger-calendar/commit/1e7b4e45f86e80a1c726364e9c31d1f6b62c1535))
* **timegrid:** key multi-day event segments per day to avoid duplicate keys ([c1a1350](https://github.com/afonsojramos/react-native-bigger-calendar/commit/c1a1350f446ec971e405841649cf229c3387a6f6))
* **timegrid:** reserve the today-badge size to avoid header layout shift ([d784047](https://github.com/afonsojramos/react-native-bigger-calendar/commit/d784047f06148cf90836c57d9658973cc9c968ef))

## [0.2.0](https://github.com/afonsojramos/react-native-bigger-calendar/compare/v0.1.0...v0.2.0) (2026-06-22)


### Features

* add 3days and custom N-day time-grid views ([353a9f8](https://github.com/afonsojramos/react-native-bigger-calendar/commit/353a9f8eb0c7ff5e79473db01997bace3dd8687f))
* add activeDate to highlight a chosen date over today ([78e0a69](https://github.com/afonsojramos/react-native-bigger-calendar/commit/78e0a6975e50b6d8e03c341daa99a67bae3fce20))
* add all-day events with a lane above the time grid ([fa25f55](https://github.com/afonsojramos/react-native-bigger-calendar/commit/fa25f5569ce7b081b3eafb35486cf8627775c472))
* add calendarCellStyle for per-date cell/column styling ([35a81fc](https://github.com/afonsojramos/react-native-bigger-calendar/commit/35a81fc59bc0bae2a0d274f425d6a34b27578546))
* add eventCellStyle for per-event styling of the default renderer ([d7083c2](https://github.com/afonsojramos/react-native-bigger-calendar/commit/d7083c20b5fb87e1b6d306daaacb1b44de3857cb))
* add hideHours, showWeekNumber and headerComponent slot ([5a16af9](https://github.com/afonsojramos/react-native-bigger-calendar/commit/5a16af975ad953e765413fe0db0793502da7fbeb))
* add hourComponent slot to customize the hour-axis label ([50bffcf](https://github.com/afonsojramos/react-native-bigger-calendar/commit/50bffcf6595752814db59166133f5d6535e322ea))
* add isRTL prop for right-to-left day-column order ([f19f28b](https://github.com/afonsojramos/react-native-bigger-calendar/commit/f19f28b06d99f6c0112b1bb5b8f73b78722567a2))
* add itemSeparatorComponent for the schedule list ([46edf06](https://github.com/afonsojramos/react-native-bigger-calendar/commit/46edf061a029a386fde704d53cc23b0c10423cae))
* add onChangeDateRange to emit the visible date span ([c93806d](https://github.com/afonsojramos/react-native-bigger-calendar/commit/c93806db15497db46c692c056f4e430ee828d77f))
* add onLongPressEvent, onLongPressCell and onLongPressDay handlers ([c23c963](https://github.com/afonsojramos/react-native-bigger-calendar/commit/c23c9638f7f0f384f3c2248013fadd97438902fd))
* add onPressDateHeader and align multi-day headers with the grid ([98658dd](https://github.com/afonsojramos/react-native-bigger-calendar/commit/98658dd86fd37dec56375b6c0dc0fa035c816607))
* add resetPageOnPressCell to recenter the grid after a cell press ([3f64c2d](https://github.com/afonsojramos/react-native-bigger-calendar/commit/3f64c2d4493dd73ae6abc195fc19921d26b617ad))
* add schedule (agenda) mode ([de17f13](https://github.com/afonsojramos/react-native-bigger-calendar/commit/de17f130c4651b474b345a597c74fd8d51d9f0d6))
* add sortedMonthView, moreLabel, showAdjacentMonths, disableMonthEventCellPress ([4264168](https://github.com/afonsojramos/react-native-bigger-calendar/commit/426416859f492190ff58dae7e643663e6ade4ed8))
* add swipeEnabled, showSixWeeks, weekNumberPrefix, showVerticalScrollIndicator ([4e1198e](https://github.com/afonsojramos/react-native-bigger-calendar/commit/4e1198e041e4061a1082e65fdb65326c617ef642))
* add timeslots sub-hour divider lines ([ec64fd5](https://github.com/afonsojramos/react-native-bigger-calendar/commit/ec64fd52b1c85201403484fe1df70cb02b0920e2))
* add verticalScrollEnabled to lock the time-grid scroll ([98e43fb](https://github.com/afonsojramos/react-native-bigger-calendar/commit/98e43fb159980b845c16edc5d1a42edc925ccb83))
* add weekEndsOn for week-anchored custom partial-week views ([5e53d43](https://github.com/afonsojramos/react-native-bigger-calendar/commit/5e53d433489e04e2657321b8f292ad85a1276c8c))
* honor ampm and showTime in the built-in event renderer ([f800d23](https://github.com/afonsojramos/react-native-bigger-calendar/commit/f800d23a4939230f8a67d192193bca8afba30271))
* honor per-event disabled (skip presses, dim default renderer) ([be8010a](https://github.com/afonsojramos/react-native-bigger-calendar/commit/be8010a1212c11ac9053d7dc5bf95b70de8b6bf0))
* localize weekday and date labels via a date-fns Locale ([1332447](https://github.com/afonsojramos/react-native-bigger-calendar/commit/1332447e6f6effcf84857216695c367deb4d6561))
* render a default month weekday header with renderHeaderForMonthView slot ([074814a](https://github.com/afonsojramos/react-native-bigger-calendar/commit/074814a16501d6a3d7910be6f54ff2ac2c886b6c))


### Bug Fixes

* remount the time-grid on day/week/custom switch to stop the mode-switch flash ([06521d4](https://github.com/afonsojramos/react-native-bigger-calendar/commit/06521d496ac4f9686b1d76e12eceb00e63b50702))
* stop the day/week-switch blank flash by remounting the grid only on first measure ([3f29457](https://github.com/afonsojramos/react-native-bigger-calendar/commit/3f29457bfc25db700ef6cb4ec2be26070433da9c))


### Reverts

* drop the mode-switch remount key (wrong root cause) ([f0d561f](https://github.com/afonsojramos/react-native-bigger-calendar/commit/f0d561f2002d132b828f9d95e3c0f9d9af4e1f30))
