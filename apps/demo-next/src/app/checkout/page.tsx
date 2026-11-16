import { DemoCheckout } from "../../components/DemoCheckout";
import { DemoNav } from "../../components/DemoNav";

export default function CheckoutPage() {
  return (
    <>
      <DemoNav current="checkout" />
      <main id="main">
        <DemoCheckout />
      </main>
    </>
  );
}
