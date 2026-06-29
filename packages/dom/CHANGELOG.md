# Changelog

## [1.0.0](https://github.com/afonsojramos/react-native-super-calendar/compare/dom-v2.0.0...dom-v1.0.0) (2026-06-29)


### ⚠ BREAKING CHANGES

* split into @super-calendar/{core,native,dom} pnpm monorepo

### Features

* align the time-grid hour-axis label across renderers ([877d2f9](https://github.com/afonsojramos/react-native-super-calendar/commit/877d2f90e38365fa54e7cb68cfb33cb338245269))
* **dom:** add a Calendar wrapper that switches view by mode ([9eb45d3](https://github.com/afonsojramos/react-native-super-calendar/commit/9eb45d3be84a7c1b8e30d9b58ddfe147fbd3fd89))
* **dom:** add Agenda schedule view ([4159841](https://github.com/afonsojramos/react-native-super-calendar/commit/415984126f61d93321853776ac0e6586d923f6f7))
* **dom:** business hours, timeslots, cell press/create, and drag parity in TimeGrid ([181f162](https://github.com/afonsojramos/react-native-super-calendar/commit/181f1627e3a1c650f95526bd424a61152eebdcd4))
* **dom:** gate day-cell keyboard navigation behind a prop ([161133d](https://github.com/afonsojramos/react-native-super-calendar/commit/161133d16a2fd22e4fcbd52b9bc7b010c1f56fce))
* **dom:** make empty time-grid columns pointer-only for creation ([dd09196](https://github.com/afonsojramos/react-native-super-calendar/commit/dd09196f43c8b767487cf6030698368850675cc7))
* **dom:** render events in MonthView and MonthList ([381961b](https://github.com/afonsojramos/react-native-super-calendar/commit/381961b8b6c5033a1f48a629bc04f325cd96068e))
* fill event boxes with whole title lines before the time ([66fbb7a](https://github.com/afonsojramos/react-native-super-calendar/commit/66fbb7a6fecdddffca118b0cadef48cc60ff3884))


### Bug Fixes

* align default hour height and time-line threshold across renderers ([e99b025](https://github.com/afonsojramos/react-native-super-calendar/commit/e99b025d58f415b4964a8d79e581a7b357d18373))
* cap the range pill at the endpoint circles instead of the cell edge ([fdc3cae](https://github.com/afonsojramos/react-native-super-calendar/commit/fdc3cae87da81fd58bfbbf847e137a54a2482857))
* **dom:** activate cells at the live scroll position, set real all-day continues flags, keep eventsByDay internal ([a897a09](https://github.com/afonsojramos/react-native-super-calendar/commit/a897a09c1f38215fed198cc3f6eb4cd05682f3c6))
* **dom:** guard month overflow, align moreLabel, stabilize keys and memoize list data ([29c4a0b](https://github.com/afonsojramos/react-native-super-calendar/commit/29c4a0bf81a6c70deedf47055dd707e52e58074f))
* **dom:** open the month list on the anchor month, not a past month ([6b3979c](https://github.com/afonsojramos/react-native-super-calendar/commit/6b3979ce86120ef97ccc5bba687f82c4effc95ba))
* **dom:** spread multi-day all-day events and harden TimeGrid pointer handling ([f2528c9](https://github.com/afonsojramos/react-native-super-calendar/commit/f2528c9682a1a082b552d410af1d0440d33b0e39))
* **dom:** stop seven-column grids from overflowing ([4aa303f](https://github.com/afonsojramos/react-native-super-calendar/commit/4aa303fcd9b99865eacbf76bcd4e130780baa6ec))
* order month and list day events all-day first across renderers ([6c0a248](https://github.com/afonsojramos/react-native-super-calendar/commit/6c0a2485ece40178a16c03006351f250a675d878))


### Miscellaneous Chores

* release 1.0.0 ([f0b9047](https://github.com/afonsojramos/react-native-super-calendar/commit/f0b9047abc3b788e0afecaffe8d648d28d161d69))


### Code Refactoring

* split into @super-calendar/{core,native,dom} pnpm monorepo ([a3b061c](https://github.com/afonsojramos/react-native-super-calendar/commit/a3b061cb7b54d3fd2caa311b6d11b9db67741689))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @super-calendar/core bumped to 1.0.0
