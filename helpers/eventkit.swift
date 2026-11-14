// 오늘의 캘린더 일정 + 미리 알림을 JSON으로 출력 (macOS EventKit)
import EventKit
import Foundation

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)
var calOK = false, remOK = false

func hex(_ c: CGColor?) -> String {
  guard let c = c, let comps = c.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?.components, comps.count >= 3 else { return "#5b8def" }
  return String(format: "#%02x%02x%02x", Int(comps[0]*255), Int(comps[1]*255), Int(comps[2]*255))
}

store.requestFullAccessToEvents { ok, _ in calOK = ok; sem.signal() }
sem.wait()
store.requestFullAccessToReminders { ok, _ in remOK = ok; sem.signal() }
sem.wait()

let cal = Calendar.current
let start = cal.startOfDay(for: Date())
let end = cal.date(byAdding: .day, value: 1, to: start)!
let iso = ISO8601DateFormatter()

var events: [[String: Any]] = []
if calOK {
  let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
  for e in store.events(matching: pred).sorted(by: { $0.startDate < $1.startDate }) {
    events.append(["title": e.title ?? "(제목 없음)", "start": iso.string(from: e.startDate),
                   "end": iso.string(from: e.endDate), "allDay": e.isAllDay,
                   "calendar": e.calendar.title, "color": hex(e.calendar.cgColor)])
  }
}

var reminders: [[String: Any]] = []
if remOK {
  let pred = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: end, calendars: nil)
  store.fetchReminders(matching: pred) { items in
    for r in items ?? [] {
      var d: [String: Any] = ["title": r.title ?? "", "priority": r.priority, "list": r.calendar.title]
      if let due = r.dueDateComponents?.date { d["due"] = iso.string(from: due) }
      reminders.append(d)
    }
    sem.signal()
  }
  sem.wait()
}

let out: [String: Any] = ["calendarAccess": calOK, "reminderAccess": remOK, "events": events, "reminders": reminders]
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(data)
