import { DemoNav } from "../../components/DemoNav";
import { DemoOrderStatus } from "../../components/DemoOrderStatus";

export default function OrdersPage() {
  return (
    <>
      <DemoNav current="orders" />
      <main id="main">
        <DemoOrderStatus />
      </main>
    </>
  );
}
