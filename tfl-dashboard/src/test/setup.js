// Runs once per test file, before any test in it. Two things every test in
// this project can otherwise trip over:

// 1. Extra `expect` matchers for asserting on rendered DOM (toBeInTheDocument,
//    etc.) — used by the component/routing smoke tests in App.test.jsx.
import "@testing-library/jest-dom/vitest";

// 2. A real IndexedDB implementation. jsdom (this project's test DOM) does
//    not implement IndexedDB at all, but db/statusHistory.js — and anything
//    that imports it, including LineStatus.jsx and Home.jsx — depends on a
//    working `indexedDB` global. fake-indexeddb/auto installs a fully
//    working in-memory implementation onto the global scope, so the exact
//    same statusHistory.js code runs unmodified under test.
import "fake-indexeddb/auto";
