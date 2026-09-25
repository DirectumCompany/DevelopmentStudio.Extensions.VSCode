
namespace Company.RefTest.App
{
  public class Consumer
  {
    public void Use()
    {
      Company.RefTest.Functions.Module.PrefixFunctionA(1);
      Company.RefTest.Functions.Module.PrefixFunctionAB(1);
      Company.RefTest.Structures.Module.IWidget widget = Company.RefTest.Structures.Module.Widget.Create();
      var id = widget.RefTestWidgetId;
      var value = Company.RefTest.PublicConstants.Parameters.RefTestConstantDays.RefTestConstantValue;
    }
  }
}
