# Changelog

## [1.0.0](https://github.com/afonsojramos/react-native-super-calendar/compare/native-v2.0.0...native-v1.0.0) (2026-06-29)


### ⚠ BREAKING CHANGES

* split into @super-calendar/{core,native,dom} pnpm monorepo

### Features

* align the time-grid hour-axis label across renderers ([877d2f9](https://github.com/afonsojramos/react-native-super-calendar/commit/877d2f90e38365fa54e7cb68cfb33cb338245269))
* fill event boxes with whole title lines before the time ([66fbb7a](https://github.com/afonsojramos/react-native-super-calendar/commit/66fbb7a6fecdddffca118b0cadef48cc60ff3884))
* **native:** add an all-day gutter label ([7aeb2a0](https://github.com/afonsojramos/react-native-super-calendar/commit/7aeb2a0248bf6c03d953f8a85cef7c1212bc600f))
* **native:** add showDragHandle to toggle the resize grip ([5343c66](https://github.com/afonsojramos/react-native-super-calendar/commit/5343c66b140b535e8bf2eb36b5e296eee6fe369d))
* **native:** export getViewDays for custom toolbars ([b725bee](https://github.com/afonsojramos/react-native-super-calendar/commit/b725bee1cc05d414dc8a088d6f3496ac92d1401f))
* **native:** give the month pager a shared title and container sizing ([b694b7b](https://github.com/afonsojramos/react-native-super-calendar/commit/b694b7b0a675bc9458568c431d520a87619c1484))
* **native:** give the schedule view a roomy default row ([2d77b74](https://github.com/afonsojramos/react-native-super-calendar/commit/2d77b74f88512f916f2f7853be8500fb1ad3586b))
* **native:** hover highlight on day cells for react-native-web ([27e7dd0](https://github.com/afonsojramos/react-native-super-calendar/commit/27e7dd0fd7a2971190117a83a69ae7f44192b27e))
* **native:** left-align month event cells to match dom ([b4a011e](https://github.com/afonsojramos/react-native-super-calendar/commit/b4a011ee3014fa71d7c4a6ef9ab9f87f812db9e7))
* **native:** render a month title and weekday header in the grid ([2bf8e94](https://github.com/afonsojramos/react-native-super-calendar/commit/2bf8e948e52a060546ce4018517465358ff296ed))
* **native:** use taller event rows and contain web tab focus in the month list ([290ee42](https://github.com/afonsojramos/react-native-super-calendar/commit/290ee427835d8607c9cc34eb5d2c651ef86b8dcf))


### Bug Fixes

* align default hour height and time-line threshold across renderers ([e99b025](https://github.com/afonsojramos/react-native-super-calendar/commit/e99b025d58f415b4964a8d79e581a7b357d18373))
* cap the range pill at the endpoint circles instead of the cell edge ([fdc3cae](https://github.com/afonsojramos/react-native-super-calendar/commit/fdc3cae87da81fd58bfbbf847e137a54a2482857))
* **native:** block user horizontal scroll paging on the web grids ([ab37ca3](https://github.com/afonsojramos/react-native-super-calendar/commit/ab37ca311b6000e386e743cce5aa369cc3a64766))
* **native:** correct web time-grid tab focus and programmatic paging ([4b2314b](https://github.com/afonsojramos/react-native-super-calendar/commit/4b2314b39a327ce48302a5d2c4ee6ed44b761b28))
* **native:** don't tint blank placeholder cells with the weekend background ([988691d](https://github.com/afonsojramos/react-native-super-calendar/commit/988691d46179132c29b76f3374b3cd35c19dea6e))
* **native:** drop the day-cell grid in the events-free month picker ([465ab52](https://github.com/afonsojramos/react-native-super-calendar/commit/465ab523a6c2c32b3b1d4d433a8ab5dd5d4b1241))
* **native:** drop the day-cell hover highlight in the events calendar ([157af70](https://github.com/afonsojramos/react-native-super-calendar/commit/157af709c92506d14d45f3fcf838140fdc551662))
* **native:** keep the time grid at the working-hours offset when paging ([000ab59](https://github.com/afonsojramos/react-native-super-calendar/commit/000ab59a9fa5048bc2a58a99ccd2ff23913ce940))
* **native:** keep the web time grid at the shared scroll offset when paging ([e0f63ed](https://github.com/afonsojramos/react-native-super-calendar/commit/e0f63ed8dd384edac6ec3e1e16bc867ba69c91c6))
* **native:** preserve the current time-grid scroll position across page switches ([4385f88](https://github.com/afonsojramos/react-native-super-calendar/commit/4385f882f20f778ded63296107c51f7d4c3fa24b))
* **native:** preserve the time-grid scroll position across page switches ([29dfa97](https://github.com/afonsojramos/react-native-super-calendar/commit/29dfa97820998ee8f7abf936a763127a54a5a1b3))
* **native:** restyle the time-grid day header to match dom ([6569753](https://github.com/afonsojramos/react-native-super-calendar/commit/6569753fa54660b8d10097ff960b853e2d4f549b))
* **native:** set pointerEvents via style instead of the deprecated prop ([b4aab52](https://github.com/afonsojramos/react-native-super-calendar/commit/b4aab52488cb298f0083322bf47c1d13e09ce740))
* **native:** show picker tap feedback on the day badge, not the cell ([275f199](https://github.com/afonsojramos/react-native-super-calendar/commit/275f19967fd3001fd044fa33fa6a963f3e26c9a2))
* **native:** size the time grid to its container width ([9eca0fc](https://github.com/afonsojramos/react-native-super-calendar/commit/9eca0fc7524fad76ecb2c9c6d165f08ebdb932f9))
* **native:** tune drag-activation holds (300ms create, 500ms move and month select) ([48ee633](https://github.com/afonsojramos/react-native-super-calendar/commit/48ee633d2b2415bb048b9f47feef685cef561160))
* **native:** vertically center the all-day gutter label ([88db66c](https://github.com/afonsojramos/react-native-super-calendar/commit/88db66cfc139156433f1e23c5eeea1efa9e89d49))
* **native:** vertically center the time-grid day header ([e1a2e66](https://github.com/afonsojramos/react-native-super-calendar/commit/e1a2e6628920a06e1a099ba0ce2fcae96b7681cf))
* order month and list day events all-day first across renderers ([6c0a248](https://github.com/afonsojramos/react-native-super-calendar/commit/6c0a2485ece40178a16c03006351f250a675d878))


### Miscellaneous Chores

* release 1.0.0 ([f0b9047](https://github.com/afonsojramos/react-native-super-calendar/commit/f0b9047abc3b788e0afecaffe8d648d28d161d69))


### Code Refactoring

* split into @super-calendar/{core,native,dom} pnpm monorepo ([a3b061c](https://github.com/afonsojramos/react-native-super-calendar/commit/a3b061cb7b54d3fd2caa311b6d11b9db67741689))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @super-calendar/core bumped to 1.0.0
