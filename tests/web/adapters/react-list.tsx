import { vi } from "vitest";
import { createElement, Fragment, useMemo, type ReactNode } from "react";

// jsdom cannot measure Legend List. Keep its row cache behavior so prop-only
// changes still exercise data/extraData invalidation. Browser tests use the real list.
vi.mock("@legendapp/list/react", () => ({
  __esModule: true,
  LegendList: (props: {
    data?: unknown[];
    extraData?: unknown;
    keyExtractor: (item: unknown) => string;
    renderItem: (arg: { item: unknown; index: number }) => ReactNode;
  }) => {
    return useMemo(
      () =>
        (props.data ?? []).map((item, index) =>
          createElement(
            Fragment,
            { key: props.keyExtractor(item) },
            props.renderItem({ item, index }),
          ),
        ),
      [props.data, props.extraData],
    );
  },
}));
