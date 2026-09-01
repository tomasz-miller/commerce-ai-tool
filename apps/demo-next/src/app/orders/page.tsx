import { DemoNav } from "../../components/DemoNav";
import { DemoOrderStatus } from "../../components/DemoOrderStatus";

export default function OrdersPage() {
  return (
    <>
      <DemoNav current="orders" />
      <div id="main">
        <DemoOrderStatus />
      </div>
    </>
  );
}
