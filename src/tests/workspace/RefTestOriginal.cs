
namespace Company.RefTest.Shared
{
  partial class ModuleFunctions
  {
    public void PrefixFunctionA(int a) {}
    public void PrefixFunctionA(int a, int b) {}
    public void PrefixFunctionAB(int a) {}
  }

  partial class Widget
  {
    public int RefTestWidgetId { get; set; }
  }

  public static class Parameters
  {
    public static class RefTestConstantDays
    {
      public const string RefTestConstantCode = "RefTestConstantDays";
      public const int RefTestConstantValue = 5;
    }
  }

  public class ConstantsConsumer
  {
    public int Use() { return Parameters.RefTestConstantDays.RefTestConstantValue; }
  }
}
