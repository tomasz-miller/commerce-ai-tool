import { DemoCheckout } from "../../components/DemoCheckout";
import { DemoNav } from "../../components/DemoNav";

export default function CheckoutPage() {
  return (
    <>
      <DemoNav current="checkout" />
      <div id="main">
        <DemoCheckout />
      </div>
    </>
  );
}
