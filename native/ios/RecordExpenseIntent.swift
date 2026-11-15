import AppIntents
import Foundation

@available(iOS 16.4, *)
struct RecordExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Lançar gasto"
  static var description = IntentDescription("Registra uma despesa de hoje no Agente TSK. O app abre para interpretar e salvar o gasto.")
  static var openAppWhenRun: Bool = true
  @available(iOS 26.0, *)
  static var supportedModes: IntentModes { .foreground }

  @Parameter(title: "Gasto", requestValueDialog: "Qual foi o gasto? Por exemplo: dez reais em gasolina.")
  var expense: String

  static var parameterSummary: some ParameterSummary {
    Summary("Lançar \(\.$expense)")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let text = expense.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, text.count <= 2000 else { throw $expense.needsValueError("Diga uma despesa curta, com valor e descrição.") }
    var pending = UserDefaults.standard.array(forKey: "tsk.pending.siri.v1") as? [[String: String]] ?? []
    guard pending.count < 30 else { return .result(dialog: "Abra o Agente TSK para resolver os lançamentos pendentes.") }
    pending.append(["id": UUID().uuidString, "text": text])
    UserDefaults.standard.set(pending, forKey: "tsk.pending.siri.v1")
    return .result(dialog: "Enviei para o Agente TSK. Confira o resultado no aplicativo.")
  }
}

@available(iOS 16.4, *)
struct TskAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RecordExpenseIntent(),
      phrases: ["Lance no \(.applicationName)", "Lançar gasto no \(.applicationName)", "Registrar gasto no \(.applicationName)"],
      shortTitle: "Lançar gasto",
      systemImageName: "plus.circle"
    )
  }
}
