import { useNavigate } from "react-router";
import pattern from "../assets/p01-04-hex-pattern.png";
import { Button } from "./Button";
import { PublicHeader } from "./PublicHeader";
import "./PublicJoinPending.css";

/** Shown where organization search would be until join requests reach the server (#356). */
export function PublicInviteOnly() {
  const navigate = useNavigate();

  return (
    <>
      <PublicHeader login={false} />
      <main className="public-pending">
        <div className="public-pending__pattern" aria-hidden="true">
          <img className="public-pending__hex public-pending__hex--1" src={pattern} alt="" />
          <img className="public-pending__hex public-pending__hex--2" src={pattern} alt="" />
          <img className="public-pending__hex public-pending__hex--3" src={pattern} alt="" />
          <img className="public-pending__hex public-pending__hex--4" src={pattern} alt="" />
        </div>
        <section className="public-pending__card">
          <p className="public-pending__eyebrow">조직 들어가기</p>
          <div className="public-pending__banner">
            <h1 className="public-pending__title">초대 링크로 들어와 주세요</h1>
            <p className="public-pending__copy">
              {
                "조직 검색과 가입 요청은 아직 준비 중이에요.\n운영진에게 초대 링크를 받아 그 링크에서 Google로 로그인해 주세요."
              }
            </p>
          </div>
          <div className="public-pending__footer public-pending__footer--end">
            <Button type="button" variant="primary" size={40} onClick={() => navigate("/events")}>
              행사 화면으로
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
