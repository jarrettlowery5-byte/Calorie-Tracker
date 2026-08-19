// Small stroked line icons — consistent weight, inherit currentColor.
const paths = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  book: "M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5v-15ZM4 17.5h15",
  calendar: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12ZM8 3v4M16 3v4M4 10h16",
  cart: "M3 4h2.2l2.2 11h9.9M6.5 8H21l-1.8 6M9 20a1 1 0 1 0 2 0 1 1 0 0 0-2 0ZM16 20a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z",
  chef: "M7 21h10M6.5 17h11l.6-6.2a3.6 3.6 0 1 0-3.3-5.4 3.6 3.6 0 0 0-5.6 0 3.6 3.6 0 1 0-3.3 5.4L6.5 17Z",
  basket: "M4 9h16l-1.6 10.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3L4 9ZM8.5 9 11 3.5M15.5 9 13 3.5M9.5 13v3.5M14.5 13v3.5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.4-2-3.4-2.2.9a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 2.4a7.6 7.6 0 0 0-2.6 1.5l-2.2-.9-2 3.4 1.8 1.4a7.6 7.6 0 0 0 0 3l-1.8 1.4 2 3.4 2.2-.9a7.6 7.6 0 0 0 2.6 1.5L10 22h4l.4-2.4a7.6 7.6 0 0 0 2.6-1.5l2.2.9 2-3.4-1.8-1.4Z",
  plus: "M12 5v14M5 12h14",
  link: "M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4M13.5 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.4-1.4",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z",
  pencil: "M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z",
  check: "M5 12.5 10 17.5 19 7",
  heart: "M12 20s-7.5-4.7-7.5-9.4A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.5 2.9C19.5 15.3 12 20 12 20Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.3 2",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6 6 18",
};

export default function Icon({ name, className = "w-5 h-5", strokeWidth = 1.6, filled = false }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
