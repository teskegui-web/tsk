import ExpoModulesCore
import Foundation

public class TskSiriModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TskSiri")
    AsyncFunction("pendingCommands") { () -> [[String: String]] in
      return UserDefaults.standard.array(forKey: "tsk.pending.siri.v1") as? [[String: String]] ?? []
    }.runOnQueue(.main)
    AsyncFunction("acknowledge") { (id: String) in
      let pending = UserDefaults.standard.array(forKey: "tsk.pending.siri.v1") as? [[String: String]] ?? []
      UserDefaults.standard.set(pending.filter { $0["id"] != id }, forKey: "tsk.pending.siri.v1")
    }.runOnQueue(.main)
  }
}
